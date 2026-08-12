import { httpRouter } from "convex/server";
import { registerMcpRoutes } from "./httpRoutes/mcp";

const http = httpRouter();

registerMcpRoutes(http);

export default http;
