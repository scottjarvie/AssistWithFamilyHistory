import { httpRouter } from "convex/server";
import { registerEvidenceUploadRoutes } from "./httpRoutes/evidenceUpload";
import { registerEvidenceOriginalRoutes } from "./httpRoutes/evidenceOriginal";
import { registerMcpRoutes } from "./httpRoutes/mcp";

const http = httpRouter();

registerMcpRoutes(http);
registerEvidenceUploadRoutes(http);
registerEvidenceOriginalRoutes(http);

export default http;
