import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Define the environment variables expected by this worker
interface Env {
	FIRECRAWL_API_KEY: string;
}

// The class definition is correct. The changes are in the 'export default' block below.
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Pricematch Agent",
		version: "1.1.0",
	});

	// The 'init' method is correctly called by the MCP SDK's serve methods
	async init(env: Env) {
		const firecrawlApiKey = env.FIRECRAWL_API_KEY;
		const firecrawlApiHeaders = {
			"Content-Type": "application/json",
			Authorization: `Bearer ${firecrawlApiKey}`,
		};

		if (!firecrawlApiKey) {
			console.error("FIRECRAWL_API_KEY is not set in the environment.");
		}

		// Tool: Find product URLs on Walmart and Target
		this.server.tool(
			"find_product_urls",
			{
				title: "Find Product URLs",
				description: "Gets the product page URL for a given product name from both Walmart.com and Target.com.",
				inputSchema: { productName: z.string() },
			},
			async ({ productName }) => {
				if (!firecrawlApiKey) {
					return { content: [{ type: "text", text: "Error: Firecrawl API key is not configured." }] };
				}
				try {
					const [walmartResponse, targetResponse] = await Promise.all([
						fetch("https://api.firecrawl.dev/v0/search", {
							method: "POST",
							headers: firecrawlApiHeaders,
							body: JSON.stringify({ query: `site:walmart.com ${productName}` }),
						}),
						fetch("https://api.firecrawl.dev/v0/search", {
							method: "POST",
							headers: firecrawlApiHeaders,
							body: JSON.stringify({ query: `site:target.com ${productName}` }),
						}),
					]);

					if (!walmartResponse.ok || !targetResponse.ok) {
						return { content: [{ type: "text", text: "Error fetching data from Firecrawl." }] };
					}
					const walmartData = await walmartResponse.json();
					const targetData = await targetResponse.json();
					const walmartUrl = walmartData.data?.[0]?.url || "Walmart URL Not Found";
					const targetUrl = targetData.data?.[0]?.url || "Target URL Not Found";
					return { content: [{ type: "text", text: walmartUrl }, { type: "text", text: targetUrl }] };
				} catch (error) {
					return { content: [{ type: "text", text: "An unexpected error occurred." }] };
				}
			}
		);

		// Tool: Extract the price from a product page URL
		this.server.tool(
			"extract_product_price",
			{
				title: "Extract Product Price",
				description: "Extracts just the price from a given product page URL.",
				inputSchema: { productUrl: z.string().url() },
			},
			async ({ productUrl }) => {
				if (!firecrawlApiKey) {
					return { content: [{ type: "text", text: "Error: Firecrawl API key is not configured." }] };
				}
				try {
					const response = await fetch("https://api.firecrawl.dev/v0/extract", {
						method: "POST",
						headers: firecrawlApiHeaders,
						body: JSON.stringify({
							url: productUrl,
							extractor: {
								mode: "llm-extraction",
								extraction_schema: {
									type: "object",
									properties: { price: { type: "string", description: "The numerical price of the product, without currency symbols." } },
									required: ["price"],
								},
							},
						}),
					});
					if (!response.ok) {
						return { content: [{ type: "text", text: "Error extracting price from URL." }] };
					}
					const extractedData = await response.json();
					const price = extractedData.data?.price || "Price not found";
					return { content: [{ type: "text", text: String(price) }] };
				} catch (error) {
					return { content: [{ type: "text", text: "An unexpected error occurred while extracting the price." }] };
				}
			}
		);

		// Simple addition tool
		this.server.tool("add", { a: z.number(), b: z.number() }, async ({ a, b }) => ({
			content: [{ type: "text", text: String(a + b) }],
		}));

		// Calculator tool with multiple operations
		this.server.tool(
			"calculate",
			{ operation: z.enum(["add", "subtract", "multiply", "divide"]), a: z.number(), b: z.number() },
			async ({ operation, a, b }) => {
				let result: number;
				switch (operation) {
					case "add": result = a + b; break;
					case "subtract": result = a - b; break;
					case "multiply": result = a * b; break;
					case "divide":
						if (b === 0) return { content: [{ type: "text", text: "Error: Cannot divide by zero" }] };
						result = a / b;
						break;
				}
				return { content: [{ type: "text", text: String(result) }] };
			}
		);
	}
}

// FIX: This 'export default' block is now corrected.
export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		// Handle the SSE connection for the AI Playground
		if (url.pathname === "/sse" || url.pathname.startsWith("/sse/")) {
			// Let the SDK handle the request. It will instantiate the agent correctly.
			// Pass 'env' so the API key is available in the 'init' method.
			return MyMCP.serveSSE("/sse", { env }).fetch(request, env, ctx);
		}

		// Handle the main MCP endpoint for tool definitions etc.
		if (url.pathname === "/mcp") {
			// Let the SDK handle this request as well.
			return MyMCP.serve("/mcp", { env }).fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
