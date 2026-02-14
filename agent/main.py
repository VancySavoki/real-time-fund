from fastapi import FastAPI
from ag_ui_adk import ADKAgent, add_adk_fastapi_endpoint
from google.adk.agents import LlmAgent
import logging
import yaml
import os
from functools import cached_property
from typing import override

from ag_ui.core import Tool as AGUITool
from ag_ui_adk import ADKAgent, add_adk_fastapi_endpoint
from ag_ui_adk.client_proxy_tool import ClientProxyTool
from anthropic import AnthropicVertex
from dotenv import load_dotenv
from fastapi import FastAPI
from google.adk.agents import LlmAgent
from typing import Dict, List, Optional, Any
from google.adk.models.anthropic_llm import Claude
from google.genai import types
from pathlib import Path

load_dotenv()

class AnthropicNormal(AnthropicVertex):
    @override
    def _prepare_options(self, options):
        return options


class LiteLLMClaude(Claude):
    @cached_property
    def _anthropic_client(self) -> AnthropicVertex:
        return AnthropicNormal(
            project_id="fake",
            region="fake",
            access_token=os.environ["ANTHROPIC_API_KEY"],
            base_url=os.environ["ANTHROPIC_BASE_URL"]
        )


agent = LlmAgent(
    name="assistant",
    model="gemini-2.5-flash" if os.getenv("GOOGLE_API_KEY") else LiteLLMClaude(
        model=os.environ["ANTHROPIC_MODEL"],
        max_tokens=20000
    ),
    generate_content_config=types.GenerateContentConfig(
        temperature=0.7,  # Slightly higher temperature for creativity
        top_p=0.9,
        top_k=40
    ),
    instruction="Be helpful and fun!"
)

adk_agent = ADKAgent(
    adk_agent=agent,
    app_name="fund_agent",
    user_id="demo_user",
    session_timeout_seconds=3600,
    use_in_memory_services=True
)

app = FastAPI()
add_adk_fastapi_endpoint(app, adk_agent, path="/")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="localhost", port=8000)
