#include "community_services_client.hpp"

#ifdef _WIN32

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winhttp.h>

#include <cctype>
#include <string>
#include <utility>
#include <vector>

#pragma comment(lib, "winhttp.lib")

namespace one61 {
namespace {

constexpr DWORD kConnectTimeoutMs = 5000;
constexpr DWORD kSendTimeoutMs = 10000;
constexpr size_t kMaxResponseBytes = 4 * 1024 * 1024;

class InternetHandle final {
public:
    explicit InternetHandle(HINTERNET handle = nullptr) noexcept : handle_(handle) {}
    ~InternetHandle() {
        if (handle_) WinHttpCloseHandle(handle_);
    }

    InternetHandle(const InternetHandle&) = delete;
    InternetHandle& operator=(const InternetHandle&) = delete;

    HINTERNET Get() const noexcept { return handle_; }

private:
    HINTERNET handle_;
};

std::string JsonEscape(const std::string& value) {
    static const char hex[] = "0123456789abcdef";
    std::string out;
    out.reserve(value.size() + 8);

    for (unsigned char ch : value) {
        switch (ch) {
        case '"': out += "\\\""; break;
        case '\\': out += "\\\\"; break;
        case '\b': out += "\\b"; break;
        case '\f': out += "\\f"; break;
        case '\n': out += "\\n"; break;
        case '\r': out += "\\r"; break;
        case '\t': out += "\\t"; break;
        default:
            if (ch < 0x20) {
                out += "\\u00";
                out += hex[(ch >> 4) & 0x0f];
                out += hex[ch & 0x0f];
            } else {
                out += static_cast<char>(ch);
            }
        }
    }
    return out;
}

std::string UrlEncode(const std::string& value) {
    static const char hex[] = "0123456789ABCDEF";
    std::string out;
    out.reserve(value.size());

    for (unsigned char ch : value) {
        if ((ch >= 'a' && ch <= 'z') ||
            (ch >= 'A' && ch <= 'Z') ||
            (ch >= '0' && ch <= '9') ||
            ch == '-' || ch == '_' || ch == '.' || ch == '~') {
            out += static_cast<char>(ch);
        } else {
            out += '%';
            out += hex[(ch >> 4) & 0x0f];
            out += hex[ch & 0x0f];
        }
    }
    return out;
}

bool IsSafeBearerToken(const std::string& token) {
    if (token.empty()) return false;
    for (unsigned char ch : token) {
        if (!(std::isalnum(ch) || ch == '.' || ch == '_' || ch == '-')) return false;
    }
    return true;
}

HttpResult Failure(DWORD error) {
    HttpResult result;
    result.transportError = error;
    return result;
}

} // namespace

CommunityServicesClient::CommunityServicesClient(std::wstring baseUrl)
    : baseUrl_(std::move(baseUrl)) {
    while (!baseUrl_.empty() && baseUrl_.back() == L'/') baseUrl_.pop_back();
}

HttpResult CommunityServicesClient::Bootstrap() const {
    return Request(L"GET", "/v1/client/bootstrap");
}

HttpResult CommunityServicesClient::Register(
    const std::string& email, const std::string& password) const {
    return Request(L"POST", "/v1/auth/register",
        "{\"email\":\"" + JsonEscape(email) +
        "\",\"password\":\"" + JsonEscape(password) + "\"}");
}

HttpResult CommunityServicesClient::Login(
    const std::string& email, const std::string& password) const {
    return Request(L"POST", "/v1/auth/login",
        "{\"email\":\"" + JsonEscape(email) +
        "\",\"password\":\"" + JsonEscape(password) + "\"}");
}

HttpResult CommunityServicesClient::Refresh(const std::string& refreshToken) const {
    return Request(L"POST", "/v1/auth/refresh",
        "{\\"refreshToken\\":\\"" + JsonEscape(refreshToken) + "\\"}");
}

HttpResult CommunityServicesClient::Logout(const std::string& refreshToken) const {
    return Request(L"POST", "/v1/auth/logout",
        "{\\"refreshToken\\":\\"" + JsonEscape(refreshToken) + "\\"}");
}

HttpResult CommunityServicesClient::LogoutAll(const std::string& accessToken) const {
    return Request(L"POST", "/v1/auth/logout-all", "{}", accessToken);
}

HttpResult CommunityServicesClient::CurrentAccount(const std::string& accessToken) const {
    return Request(L"GET", "/v1/client/account", {}, accessToken);
}

HttpResult CommunityServicesClient::PlayerProfile(const std::string& accessToken) const {
    return Request(L"GET", "/v1/player/profile", {}, accessToken);
}

HttpResult CommunityServicesClient::SearchPlayers(
    const std::string& accessToken, const std::string& query) const {
    return Request(L"GET", "/v1/social/players?query=" + UrlEncode(query), {}, accessToken);
}

HttpResult CommunityServicesClient::Friends(const std::string& accessToken) const {
    return Request(L"GET", "/v1/social/friends", {}, accessToken);
}

HttpResult CommunityServicesClient::FriendRequests(
    const std::string& accessToken, bool incoming) const {
    return Request(L"GET",
        incoming ? "/v1/social/friend-requests?direction=incoming"
                 : "/v1/social/friend-requests?direction=outgoing",
        {}, accessToken);
}

HttpResult CommunityServicesClient::SendFriendRequest(
    const std::string& accessToken, const std::string& targetUserId) const {
    return Request(L"POST", "/v1/social/friend-requests",
        "{\"targetUserId\":\"" + JsonEscape(targetUserId) + "\"}", accessToken);
}

HttpResult CommunityServicesClient::AcceptFriendRequest(
    const std::string& accessToken, const std::string& targetUserId) const {
    return Request(L"POST",
        "/v1/social/friend-requests/" + UrlEncode(targetUserId) + "/accept", "{}", accessToken);
}

HttpResult CommunityServicesClient::RemoveFriend(
    const std::string& accessToken, const std::string& targetUserId) const {
    return Request(L"DELETE", "/v1/social/friends/" + UrlEncode(targetUserId), {}, accessToken);
}

HttpResult CommunityServicesClient::Heartbeat(
    const std::string& accessToken, bool away) const {
    return Request(L"PUT", "/v1/presence/heartbeat",
        away ? "{\"status\":\"away\"}" : "{\"status\":\"online\"}", accessToken);
}

HttpResult CommunityServicesClient::PublicSessions(const std::string& accessToken) const {
    return Request(L"GET", "/v1/sessions", {}, accessToken);
}

HttpResult CommunityServicesClient::QueueMatchmaking(
    const std::string& accessToken,
    const std::string& gameMode,
    const std::string& region) const {
    return Request(L"POST", "/v1/matchmaking/queue",
        "{\"gameMode\":\"" + JsonEscape(gameMode) +
        "\",\"region\":\"" + JsonEscape(region) + "\"}", accessToken);
}

HttpResult CommunityServicesClient::Request(
    const wchar_t* method,
    const std::string& path,
    const std::string& body,
    const std::string& accessToken) const {
    if (baseUrl_.empty() || path.empty() || path.front() != '/') {
        return Failure(ERROR_INVALID_PARAMETER);
    }
    if (!accessToken.empty() && !IsSafeBearerToken(accessToken)) {
        return Failure(ERROR_INVALID_PARAMETER);
    }

    URL_COMPONENTS parts{};
    parts.dwStructSize = sizeof(parts);
    parts.dwSchemeLength = static_cast<DWORD>(-1);
    parts.dwHostNameLength = static_cast<DWORD>(-1);
    parts.dwUrlPathLength = static_cast<DWORD>(-1);
    parts.dwExtraInfoLength = static_cast<DWORD>(-1);

    if (!WinHttpCrackUrl(baseUrl_.c_str(), 0, &parts)) return Failure(GetLastError());
    if (!parts.lpszHostName || parts.dwHostNameLength == 0) return Failure(ERROR_INVALID_PARAMETER);

    const std::wstring host(parts.lpszHostName, parts.dwHostNameLength);
    const bool secure = parts.nScheme == INTERNET_SCHEME_HTTPS;
    if (!secure && parts.nScheme != INTERNET_SCHEME_HTTP) return Failure(ERROR_INVALID_PARAMETER);

    const std::wstring urlPath(path.begin(), path.end());
    InternetHandle session(WinHttpOpen(
        L"1.61ONLINE-CommunityClient/1.0",
        WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
        WINHTTP_NO_PROXY_NAME,
        WINHTTP_NO_PROXY_BYPASS,
        0));
    if (!session.Get()) return Failure(GetLastError());

    WinHttpSetTimeouts(session.Get(), kConnectTimeoutMs, kConnectTimeoutMs,
        kSendTimeoutMs, kSendTimeoutMs);

    InternetHandle connection(WinHttpConnect(session.Get(), host.c_str(), parts.nPort, 0));
    if (!connection.Get()) return Failure(GetLastError());

    const DWORD flags = secure ? WINHTTP_FLAG_SECURE : 0;
    InternetHandle request(WinHttpOpenRequest(
        connection.Get(), method, urlPath.c_str(), nullptr,
        WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags));
    if (!request.Get()) return Failure(GetLastError());

    std::wstring headers = L"Accept: application/json\r\n";
    if (!body.empty()) headers += L"Content-Type: application/json; charset=utf-8\r\n";
    if (!accessToken.empty()) {
        const std::wstring wideToken(accessToken.begin(), accessToken.end());
        headers += L"Authorization: Bearer " + wideToken + L"\r\n";
    }

    LPVOID optionalData = body.empty()
        ? WINHTTP_NO_REQUEST_DATA
        : const_cast<char*>(body.data());
    const DWORD bodyLength = static_cast<DWORD>(body.size());

    if (!WinHttpSendRequest(request.Get(), headers.c_str(), static_cast<DWORD>(-1),
            optionalData, bodyLength, bodyLength, 0)) {
        return Failure(GetLastError());
    }
    if (!WinHttpReceiveResponse(request.Get(), nullptr)) return Failure(GetLastError());

    DWORD statusCode = 0;
    DWORD statusSize = sizeof(statusCode);
    if (!WinHttpQueryHeaders(request.Get(),
            WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
            WINHTTP_HEADER_NAME_BY_INDEX, &statusCode, &statusSize,
            WINHTTP_NO_HEADER_INDEX)) {
        return Failure(GetLastError());
    }

    HttpResult result;
    result.transportOk = true;
    result.statusCode = statusCode;

    for (;;) {
        DWORD available = 0;
        if (!WinHttpQueryDataAvailable(request.Get(), &available)) return Failure(GetLastError());
        if (available == 0) break;
        if (result.body.size() + available > kMaxResponseBytes) {
            return Failure(ERROR_FILE_TOO_LARGE);
        }

        std::vector<char> chunk(available);
        DWORD received = 0;
        if (!WinHttpReadData(request.Get(), chunk.data(), available, &received)) {
            return Failure(GetLastError());
        }
        result.body.append(chunk.data(), received);
        if (received == 0) break;
    }

    return result;
}

} // namespace one61

#endif // _WIN32
