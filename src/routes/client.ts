import type { FastifyPluginAsync } from "fastify";
import { pool } from "../db/pool.js";

const clientRoutes: FastifyPluginAsync = async (app) => {
  // This is the project's own client contract, not a Rockstar endpoint or protocol.
  app.get("/bootstrap", async () => ({
    product: {
      id: "1.61online",
      displayName: "1.61ONLINE Community Services",
      serviceOwner: "community"
    },
    contract: {
      id: "community-client-services",
      version: 1,
      apiBasePath: "/v1",
      authentication: "bearer-access-token"
    },
    endpoints: {
      register: "/v1/auth/register",
      login: "/v1/auth/login",
      refresh: "/v1/auth/refresh",
      logout: "/v1/auth/logout",
      logoutAll: "/v1/auth/logout-all",
      currentAccount: "/v1/client/account",
      playerProfile: "/v1/player/profile",
      playerSearch: "/v1/social/players",
      friends: "/v1/social/friends",
      friendRequests: "/v1/social/friend-requests",
      presenceHeartbeat: "/v1/presence/heartbeat",
      presenceDirectory: "/v1/presence",
      sessions: "/v1/sessions",
      matchmakingQueue: "/v1/matchmaking/queue",
      matchmakingStatus: "/v1/matchmaking/status"
    },
    presence: {
      heartbeatIntervalSeconds: 30,
      activeLeaseSeconds: 90
    },
    capabilities: {
      accountRegistration: true,
      accountLogin: true,
      playerProfiles: true,
      playerSearch: true,
      friendsAndRequests: true,
      presence: true,
      publicSessions: true,
      matchmakingQueue: true,
      automaticMatchmaking: false,
      realtimeGameplayTransport: false,
      serverAuthoritativeGameplay: false,
      cloudSaves: false,
      achievements: false,
      voiceChat: false,
      gameEntitlementChecks: false
    },
    integrationNotes: [
      "This contract is for a community client adapter that is intentionally configured to use 1.61ONLINE.",
      "It does not claim wire compatibility with proprietary Rockstar Social Club services.",
      "A compatible game client and a separately designed gameplay transport are still required."
    ]
  }));

  app.get("/account", { preHandler: [app.authenticate] }, async (request, reply) => {
    const result = await pool.query<{
      id: string;
      email: string | null;
      created_at: Date;
      display_name: string | null;
      rank: number;
      cash: string;
      bank: string;
      presence_status: string;
      last_seen_at: Date | null;
    }>(
      `SELECT u.id, u.email, u.created_at,
              pp.display_name, pp.rank, pp.cash::text, pp.bank::text,
              COALESCE(
                CASE WHEN p.last_seen_at > NOW() - INTERVAL '90 seconds'
                  THEN p.status ELSE 'offline' END,
                'offline'
              ) AS presence_status,
              p.last_seen_at
       FROM users u
       JOIN player_profiles pp ON pp.user_id = u.id
       LEFT JOIN player_presence p ON p.user_id = u.id
       WHERE u.id = $1`,
      [request.user.sub]
    );

    const account = result.rows[0];
    if (!account) return reply.code(404).send({ error: "account_not_found" });

    return {
      account: {
        id: account.id,
        email: account.email,
        createdAt: account.created_at
      },
      player: {
        displayName: account.display_name,
        rank: account.rank,
        cash: account.cash,
        bank: account.bank
      },
      presence: {
        status: account.presence_status,
        lastSeenAt: account.last_seen_at
      }
    };
  });
};

export default clientRoutes;
