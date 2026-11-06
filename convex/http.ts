import { httpRouter } from "convex/server";
import { registerEvidenceUploadRoutes } from "./httpRoutes/evidenceUpload";
import { registerMcpRoutes } from "./httpRoutes/mcp";

import { registerApiKeyAccessRoutes } from "./httpRoutes/apiKeyAccess";

const http = httpRouter();

registerMcpRoutes(http);
registerApiKeyAccessRoutes(http);
registerEvidenceUploadRoutes(http);

export default http;
