import { DockgeServer } from "./dockge-server";
import { Express, Router as ExpressRouter } from "express";

export abstract class Router {
    /** Express mount path for this router. Defaults to "/" if not set. */
    mountPath?: string;

    abstract create(app : Express, server : DockgeServer): ExpressRouter;
}
