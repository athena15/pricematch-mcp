import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Define the environment variables expected by this worker
interface Env {
	FIRECRAWL_API_KEY: string;
	MCP_API_KEY: string;
}

export class MyMCP extends McpAgent<Env> { // Specify Env type for the agent
	server = new McpServer({
		name: "Pricematch Agent",
		version: "1.2.0", // Incremented version
	});

	// FIX: The 'init' method does not receive 'env' as a parameter.
	// It should access the environment via 'this.env', which is set
	// by the base McpAgent constructor.
	async init() {
		// Use this.env to access environment variables
		const firecrawlApiKey = this.env.FIRECRAWL_API_KEY;
		const firecrawlApiHeaders = {
			"Content-Type": "application/json",
			Authorization: `Bearer ${firecrawlApiKey}`,
		};

		if (!firecrawlApiKey) {
			console.error("FIRECRAWL_API_KEY is not available in this.env.");
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

// This fetch handler is correct and does not need to change.
export default {
  	fetch(request: Request, env: Env, ctx: ExecutionContext) {
  		const url = new URL(request.url);

  		// API Key validation for Confluent Flink compatibility
  		const apiKey = request.headers.get('api-key') ||
  		              (request.headers.get('authorization')?.replace('Bearer ', ''));

  		const expectedApiKey = env.MCP_API_KEY; // Get from environment variable

  		// Skip API key validation for OPTIONS requests (CORS preflight)
  		if (request.method !== 'OPTIONS' && apiKey !== expectedApiKey) {
  			console.log(`[${new Date().toISOString()}] Unauthorized: API key '${apiKey}' does not match 
  expected key`);
  			return new Response('Unauthorized: Invalid or missing API key', {
  				status: 401,
  				headers: {
  					'Access-Control-Allow-Origin': '*',
  					'Access-Control-Allow-Headers': 'Content-Type, api-key, Authorization',
  					'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  				}
  			});
  		}

  		// Handle the SSE connection for the AI Playground
  		if (url.pathname === "/sse" || url.pathname.startsWith("/sse/")) {
  			return MyMCP.serveSSE("/sse", { env }).fetch(request, env, ctx);
  		}

  		// Handle the main MCP endpoint
  		if (url.pathname === "/mcp") {
  			return MyMCP.serve("/mcp", { env }).fetch(request, env, ctx);
  		}

  		return new Response("Not found", { status: 404 });
  	},
  };
