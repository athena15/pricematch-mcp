# Building a Remote MCP Server on Cloudflare

This example allows you to deploy a remote MCP server on Cloudflare Workers.

## Get started: 

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fathena15%2Fpricematch-mcp)

This will deploy your MCP server to a URL like: `pricematch-mcp.<your-account>.workers.dev/sse`. By far the easiest way to get started. By using this method, you'll have access to the Firecrawl MCP tools we've added to our server.

Alternatively, you can use the command line below to get a basic remote MCP Server created on your local machine (no Firecrawl tools):
```bash
npm create cloudflare@latest -- my-mcp-server --template=cloudflare/ai/demos/remote-mcp-authless
```

## Customizing your MCP Server

To add your own [tools](https://developers.cloudflare.com/agents/model-context-protocol/tools/) to the MCP server, define each tool inside the `init()` method of `src/index.ts` using `this.server.tool(...)`. You can see how we've added Firecrawl tools by visiting `src/index.ts` in this repo.

## Test with Cloudflare AI Playground

You can connect to your MCP server from the Cloudflare AI Playground, which is a remote MCP client:

1. Go to https://playground.ai.cloudflare.com/
2. Enter your deployed MCP server URL (`pricematch-mcp.<your-account>.workers.dev/sse`)
3. You can now see what MCP tools are available and use them directly from the playground!
