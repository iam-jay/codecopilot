from flask import Flask, g, request, jsonify
from llama_index.llms.azure_openai import AzureOpenAI
from llama_index.embeddings.azure_openai import AzureOpenAIEmbedding
from llama_index.core import (
    VectorStoreIndex,
    SimpleDirectoryReader,
    StorageContext,
    load_index_from_storage,
    Settings
)
import os
import json

app = Flask(__name__)

app_config = {}
  

def createIndex():
    azure_endpoint = "";
    api_key = "";
    api_version = "2023-05-15"

    llm = AzureOpenAI(
        model="gpt-4-32k",
        deployment_name="gpt-4-32k",
        api_key=api_key,
        azure_endpoint=azure_endpoint,
        api_version=api_version,
    )
    embed_model = AzureOpenAIEmbedding(
    model="text-embedding-ada-002",
    deployment_name="text-embedding-ada-002",
    api_key=api_key,
    azure_endpoint=azure_endpoint,
    api_version=api_version,
    )
    Settings.llm = llm
    Settings.embed_model = embed_model
    PERSIST_DIR = "C:\\Users\jayprakash\\Auto-Completion_Support_on_Intune_Configuration_Files-eda7ca66-5\\storage"
    if not os.path.exists(PERSIST_DIR):
        print('Loading the index freshly')
        # load the documents and create the index
        documents = SimpleDirectoryReader("C:\\Users\jayprakash\\Auto-Completion_Support_on_Intune_Configuration_Files-eda7ca66-5\\data", recursive=True).load_data()
        index = VectorStoreIndex.from_documents(documents)
        # store it for later
        index.storage_context.persist(persist_dir=PERSIST_DIR)
    else:
        print('Loading the index from storage')
        # load the existing index
        storage_context = StorageContext.from_defaults(persist_dir=PERSIST_DIR)
        index = load_index_from_storage(storage_context)
    query_engine = index.as_query_engine()
    return query_engine
# Example route that uses the context
@app.route('/fixedPropmpt')
def index():
    # Access the query one
    engine = app_config["query_engine"]
    answwer = engine.query("What all different properties starts with the prefix as CosmosDB.")
    return f"Hello from Flask! Context: {answwer}"

@app.route('/getsuggestion', methods=['POST'])
def get_suggestion():
    # Get the JSON data from the request body
    data = request.json

    # Check if 'message' key is present in the JSON data
    if 'prompt' in data:
        # Retrieve the message from the JSON data
        message = data['prompt']
        print("prompt ", message)
        engine = app_config["query_engine"]
        answwer = engine.query(message)
        print("suggestion: \n ", answwer)
        # Create a response JSON
        response = {'status': 'success', 'suggestion': str(answwer)}
        response_json = json.dumps(response)
        # Return the response as JSON
        return response_json
    else:
        # If 'message' key is not present, return an error response
        error_response = {'status': 'error', 'message': 'Missing "message" in the request body'}
        return jsonify(error_response), 400  # Return a 400 Bad Request status code


if __name__ == '__main__':
    app_config['query_engine'] = createIndex()
    app.run(port='808')