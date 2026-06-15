import { DockgeServer } from "../dockge-server";
import { Router } from "../router";
import express, { Express, Request, Response, Router as ExpressRouter } from "express";
import { AccessToken } from "../models/access-token";
import { Stack } from "../stack";
import { DockgeSocket } from "../util-server";
import { ValidationError } from "../util-server";

// Extend the express Request type to carry userID
declare module "express-serve-static-core" {
    interface Request {
        userID?: number;
    }
}

/**
 * Build a minimal DockgeSocket stub for use in REST-initiated stack operations.
 * Terminal.exec only needs: id, connected, endpoint, emitAgent (for streaming),
 * and userID (for auth). All stack operations on the local agent use endpoint "".
 */
function makeApiSocket(userID: number): DockgeSocket {
    return {
        id: "cicd-api-" + userID,
        endpoint: "",
        connected: true,
        emitAgent: () => { /* no-op: REST callers don't receive streamed output */ },
        userID,
    } as unknown as DockgeSocket;
}

export class ApiRouter extends Router {
    mountPath = "/api";

    create(app: Express, server: DockgeServer): ExpressRouter {
        const router = express.Router();

        // Parse JSON bodies for all /api routes
        router.use(express.json());

        // ── Auth middleware ────────────────────────────────────────────────────
        router.use(async (req: Request, res: Response, next) => {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith("Bearer ")) {
                res.status(401).json({ ok: false, msg: "Unauthorized" });
                return;
            }
            const token = authHeader.slice(7).trim();
            try {
                const userID = await AccessToken.getUserIDByToken(token);
                if (!userID) {
                    res.status(401).json({ ok: false, msg: "Unauthorized" });
                    return;
                }
                req.userID = userID;
                next();
            } catch (e) {
                res.status(500).json({ ok: false, msg: "Internal server error" });
            }
        });

        // ── Helper ────────────────────────────────────────────────────────────
        const handleError = (e: unknown, res: Response) => {
            if (e instanceof ValidationError) {
                const msg = (e as Error).message;
                if (msg.toLowerCase().includes("not found")) {
                    res.status(404).json({ ok: false, msg });
                } else {
                    res.status(400).json({ ok: false, msg });
                }
            } else if (e instanceof Error) {
                const msg = e.message;
                if (msg.includes("Another operation is already running")) {
                    res.status(409).json({ ok: false, msg });
                } else if (msg.toLowerCase().includes("not found")) {
                    res.status(404).json({ ok: false, msg });
                } else {
                    res.status(500).json({ ok: false, msg });
                }
            } else {
                res.status(500).json({ ok: false, msg: "Unknown error" });
            }
        };

        // ── Routes ────────────────────────────────────────────────────────────

        /**
         * Edit an existing stack's compose file (save only, no redeploy).
         * Body: { composeYAML: string, composeENV?: string }
         */
        router.put("/stacks/:name", async (req: Request, res: Response) => {
            try {
                const { name } = req.params;
                const { composeYAML, composeENV } = req.body || {};
                if (typeof composeYAML !== "string") {
                    res.status(400).json({ ok: false, msg: "composeYAML is required" });
                    return;
                }
                const stack = new Stack(server, name, composeYAML, composeENV ?? "", false);
                await stack.save(false);
                server.sendStackList();
                res.json({ ok: true });
            } catch (e) {
                handleError(e, res);
            }
        });

        /**
         * Start a stack (docker compose up -d --remove-orphans)
         */
        router.post("/stacks/:name/start", async (req: Request, res: Response) => {
            try {
                const { name } = req.params;
                const socket = makeApiSocket(req.userID!);
                const stack = await Stack.getStack(server, name);
                await stack.start(socket);
                server.sendStackList();
                res.json({ ok: true });
            } catch (e) {
                handleError(e, res);
            }
        });

        /**
         * Stop a stack (docker compose stop)
         */
        router.post("/stacks/:name/stop", async (req: Request, res: Response) => {
            try {
                const { name } = req.params;
                const socket = makeApiSocket(req.userID!);
                const stack = await Stack.getStack(server, name);
                await stack.stop(socket);
                server.sendStackList();
                res.json({ ok: true });
            } catch (e) {
                handleError(e, res);
            }
        });

        /**
         * Restart a stack (docker compose restart)
         */
        router.post("/stacks/:name/restart", async (req: Request, res: Response) => {
            try {
                const { name } = req.params;
                const socket = makeApiSocket(req.userID!);
                const stack = await Stack.getStack(server, name);
                await stack.restart(socket);
                server.sendStackList();
                res.json({ ok: true });
            } catch (e) {
                handleError(e, res);
            }
        });

        /**
         * Update a stack: pull new images, then restart if running
         * (docker compose pull; docker compose up -d)
         */
        router.post("/stacks/:name/update", async (req: Request, res: Response) => {
            try {
                const { name } = req.params;
                const socket = makeApiSocket(req.userID!);
                const stack = await Stack.getStack(server, name);
                await stack.update(socket);
                server.sendStackList();
                res.json({ ok: true });
            } catch (e) {
                handleError(e, res);
            }
        });

        return router;
    }
}
