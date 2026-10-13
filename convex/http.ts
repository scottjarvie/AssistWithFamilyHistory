import { httpRouter } from "convex/server";
import { registerEvidenceUploadRoutes } from "./httpRoutes/evidenceUpload";
import { registerMcpRoutes } from "./httpRoutes/mcp";

const http = httpRouter();

registerMcpRoutes(http);
registerEvidenceUploadRoutes(http);

export default http;
