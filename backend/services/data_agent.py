from langchain_openai import ChatOpenAI
from langchain_experimental.agents import create_pandas_dataframe_agent
import dotenv

dotenv.load_dotenv()

def ask_dataframe(df, question: str):
    llm = ChatOpenAI(
        model="gpt-4o-mini",
        temperature=0
    )

    agent = create_pandas_dataframe_agent(
        llm,
        df,
        agent_type="tool-calling",
        verbose=True,
        allow_dangerous_code=True
    )

    result = agent.invoke({
        "input": question
    })

    return result["output"]