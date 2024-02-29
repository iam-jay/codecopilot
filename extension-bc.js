// extension.js
const vscode = require('vscode');
//const { OpenAI } = require('openai');
//process.env.OPENAI_API_KEY = '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'; // Replace with your actual OpenAI API key
//const openai = new OpenAI();

const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");


const endpoint = "https://msec-hackathon-australia-east.openai.azure.com/";
const credential = new AzureKeyCredential("5117412d767641e09b3c715e78991084");
const deploymentId = "gpt-4-32k";
const client = new OpenAIClient(endpoint,credential);
function activate(context) {
    console.log('Codecopilot extension activating...');

    let disposable = vscode.commands.registerCommand('codecopilot.startChat', () => {
        console.log('Command executed: codecopilot.startChat');
        ChatPanel.createOrShow(context.extensionUri);
    });

    context.subscriptions.push(disposable);

    console.log('Codecopilot extension activated.');
}

class ChatPanel {
    static currentPanel = undefined;
    static viewType = 'chatGPT';

    constructor(panel, extensionUri) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._disposables = [];

        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.onDidChangeViewState(() => {
            if (this._panel.visible) {
                this._update();
            }
        }, null, this._disposables);
    }

    static createOrShow(extensionUri) {
        console.log('Creating or showing Chat Panel...');

        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (ChatPanel.currentPanel) {
            ChatPanel.currentPanel._panel.reveal(column);
        } else {
            const panel = vscode.window.createWebviewPanel(
                ChatPanel.viewType,
                'Codecopilot Chat',
                column || vscode.ViewColumn.One,
                {
                    enableScripts: true,
                }
            );

            ChatPanel.currentPanel = new ChatPanel(panel, extensionUri);
        }
    }

    async _getChatSuggestions(prompt) {
        try {

            const messages = [
                    { role: 'system', content: 'You are AI trained to give all answers.' },
                    { role: 'user', content: prompt },
                ];
            const result = await client.getChatCompletions(deploymentId, messages, { maxTokens: 128 });
            return result.choices[0]['message']['content'];
        } catch (error) {
            console.error('Error fetching chat suggestions:', error.message);
            return [];
        }
    }

    _update() {
        const webview = this._panel.webview;

        // Handle messages sent from the webview
        webview.onDidReceiveMessage(
            async message => {
                if (message.command === 'getChatSuggestions') {
                    const suggestions = await this._getChatSuggestions(message.message);
                    // Send the suggestions back to the webview
                    console.log('Sending suggestions to webview:', suggestions);
                    webview.postMessage({ command: 'receiveChatSuggestions', suggestions });
                }
                if (message.command === 'receiveChatSuggestions') {
                    console.log('Received receiveChatSuggestions command'); // Add this line for debugging
                }
            },
            null,
            this._disposables
        );

        // Update the HTML content of the webview
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    _getHtmlForWebview(webview) {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    input[type="text"] {
                        width: 80%; /* Set your preferred width */
                        padding: 10px; /* Set your preferred padding */
                        font-size: 16px; /* Set your preferred font size */
                    }
                </style>
                <script>
                    const vscode = acquireVsCodeApi();
    
                    async function sendChatMessage() {
                        const inputElement = document.getElementById('chat-input');
                        const userMessage = inputElement.value.trim();
    
                        if (userMessage !== '') {
                            const chatContainer = document.getElementById('chat-container');
                            chatContainer.innerHTML += '<div>User: ' + userMessage + '</div>';
    
                            try {
                                // Call the API to get chat suggestions
                                const suggestions = await vscode.postMessage({ command: 'getChatSuggestions', message: userMessage });
                    
                                // Display suggestions in the chat container
                                // receiveChatSuggestions(suggestions);
                            } catch (error) {
                                console.error('Error calling getChatSuggestions:', error.message);
                            }
    
                            // Clear the input field
                            inputElement.value = '';
                        }
                    }
    
                    function receiveChatSuggestions(suggestions) {
                        console.log('priniting suggestion in web');

                        console.log(suggestions);
                        const chatContainer = document.getElementById('chat-container');
                        // Clear previous suggestions
                        // chatContainer.innerHTML = '';
                        // Display new suggestions
                        chatContainer.innerHTML += '<div>ChatGPT: ' + suggestions + '</div>';
                        
                    }
                </script>
            </head>
            <body>
                <div id="chat-container"></div>
                <input type="text" id="chat-input" placeholder="Type your message...">
                <button onclick="sendChatMessage()">Send</button>
            </body>
            </html>
        `;
    }

    dispose() {
        ChatPanel.currentPanel = undefined;
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}

module.exports = {
    activate
};
