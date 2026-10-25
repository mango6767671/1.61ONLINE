#pragma once

#ifdef _WIN32

#include <string>

namespace one61 {

struct HttpResult {
    bool transportOk = false;
    unsigned int statusCode = 0;
    unsigned long transportError = 0;
    std::string body;

    bool HttpOk() const noexcept {
        return transportOk && statusCode >= 200 && statusCode < 300;
    }
};

// Small WinHTTP adapter for a client intentionally configured to use the
// 1.61ONLINE community contract. It is not a Social Club ABI replacement.
class CommunityServicesClient final {
public:
    // Supply an origin only, for example https://online.example.com or
    // http://127.0.0.1:3000 for a local development server.
    explicit CommunityServicesClient(std::wstring baseUrl);

    HttpResult Bootstrap() const;
    HttpResult Register(const std::string& email, const std::string& password) const;
    HttpResult Login(const std::string& email, const std::string& password) const;
    HttpResult Refresh(const std::string& refreshToken) const;
    HttpResult Logout(const std::string& refreshToken) const;
    HttpResult LogoutAll(const std::string& accessToken) const;
    HttpResult CurrentAccount(const std::string& accessToken) const;
    HttpResult PlayerProfile(const std::string& accessToken) const;
    HttpResult SearchPlayers(const std::string& accessToken, const std::string& query) const;
    HttpResult Friends(const std::string& accessToken) const;
    HttpResult FriendRequests(const std::string& accessToken, bool incoming = true) const;
    HttpResult SendFriendRequest(const std::string& accessToken, const std::string& targetUserId) const;
    HttpResult CancelFriendRequest(const std::string& accessToken, const std::string& targetUserId) const;
    HttpResult AcceptFriendRequest(const std::string& accessToken, const std::string& targetUserId) const;
    HttpResult RemoveFriend(const std::string& accessToken, const std::string& targetUserId) const;
    HttpResult Heartbeat(const std::string& accessToken, bool away = false) const;
    HttpResult PresenceDirectory(const std::string& accessToken) const;
    HttpResult PublicSessions(const std::string& accessToken) const;
    HttpResult CreateSession(
        const std::string& accessToken,
        const std::string& name,
        const std::string& region,
        const std::string& gameMode,
        int maxPlayers = 16) const;
    HttpResult JoinSession(const std::string& accessToken, const std::string& sessionId) const;
    HttpResult LeaveSession(const std::string& accessToken, const std::string& sessionId) const;
    HttpResult QueueMatchmaking(
        const std::string& accessToken,
        const std::string& gameMode,
        const std::string& region) const;
    HttpResult MatchmakingStatus(const std::string& accessToken) const;
    HttpResult CancelMatchmaking(const std::string& accessToken) const;

private:
    std::wstring baseUrl_;

    HttpResult Request(
        const wchar_t* method,
        const std::string& path,
        const std::string& body = {},
        const std::string& accessToken = {}) const;
};

} // namespace one61

#endif // _WIN32
