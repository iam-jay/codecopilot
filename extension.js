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

// Placeholder for global suggestion
let globalSuggestion = '';

// Static map to determine language based on file extension
const languageMap = {
    'js': 'javascript',
    'ts': 'typescript',
    'py': 'python',
    'xml': 'xml'
    // Add more mappings as needed
};

function activate(context) {
    console.log('Codecopilot extension activating...');

    // Function to get the language of the active file
    const getLanguage = () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const fileName = activeEditor.document.fileName;
            const fileExtension = fileName.split('.').pop();
            return languageMap[fileExtension] || null;
        }
        return null;
    };

    // Attach listener for text document changes
    vscode.workspace.onDidChangeTextDocument(event => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const language = getLanguage();
            const fullContent = activeEditor.document.getText();
            const line = activeEditor.document.lineAt(activeEditor.selection.active.line).text;

            // Check if the line starts with a specific comment marker
            if (line.startsWith('// codecopilot suggest')) {
                // Extract the message and trigger suggestion request
                const message = line.replace('codecopilot suggest', '').trim();
                requestSuggestion(language, message);
            }else {
                // If not, check for space key presses
                const lastChange = event.contentChanges[event.contentChanges.length - 1];
                const typedChar = lastChange.text;

                if (typedChar.includes(' ')) {
                    // Extract the input before the space
                    const input = fullContent.substr(0, activeEditor.selection.active.character).trim();
    
                    // Trigger suggestion request for the input
                    requestSuggestion(language, input);
                }
            }
        }
    }, null, context.subscriptions);


    let disposable = vscode.commands.registerCommand('codecopilot.startChat', () => {
        console.log('Command executed: codecopilot.startChat');
        ChatPanel.createOrShow(context.extensionUri);
    });

    // Register the command for start chat
    context.subscriptions.push(disposable);

    // Register the command for inserting suggestions
    context.subscriptions.push(vscode.commands.registerCommand('codecopilot.insertSuggestion', insertSuggestion));

    // Register an event to handle tab key press and insert suggestion
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('editor.action.insertSnippet', (editor, edit, args) => {
        insertSuggestion(editor, edit, args);
    }));
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('editor.action.triggerSuggest', onCompletionHandler));
    console.log('Codecopilot extension activated.');
}

async function onCompletionHandler() {
    console.log("onCompletionHandler triggered!");

    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && globalSuggestion) {
        console.log("Inserting suggestion:", globalSuggestion);

        // Insert the suggestion at the current cursor position
        await activeEditor.edit(editBuilder => {
            const position = activeEditor.selection.active;
            const range = new vscode.Range(position.with(undefined, 0), position);
            editBuilder.replace(range, globalSuggestion);
        });
    }
}


// Function to handle suggestion request
async function requestSuggestion(language, message) {
    try {
        // Your logic to request a suggestion based on language and message
        console.log("requesting suggestion");

        const suggestion = await getCodeSuggestions(language, message)
        storeSuggestion(language, suggestion);
        vscode.window.showInformationMessage(`Suggestion received: ${suggestion}`);
    } catch (error) {
        console.error('Error fetching suggestions:', error.message);
    }
}

async function getCodeSuggestions(language, prompt) {
    try {
        prompt = "give code for " + prompt + "in " + language;
        const messages = [
                { role: 'system', content: 'You are AI and trained in all programming lanagues. When I ask for code only code and comments in that no explanation.' },
                { role: 'user', content: prompt },
            ];
        const result = await client.getChatCompletions(deploymentId, messages, { maxTokens: 128 });
        return result.choices[0]['message']['content'];
    } catch (error) {
        console.error('Error fetching chat suggestions:', error.message);
        return [];
    }
}

function storeSuggestion(language, suggestion) {
    // Your logic to store the suggestion based on language
    // For example, let's store it globally for simplicity
    globalSuggestion = suggestion;
}

// Function to handle tab press and insert suggestion
async function insertSuggestion() {
    const activeEditor = vscode.window.activeTextEditor;

    // Check if there is an active editor and a global suggestion
    if (activeEditor && globalSuggestion) {
        // Insert the suggestion at the current cursor position
        await activeEditor.edit(editBuilder => {
            editBuilder.insert(activeEditor.selection.active, globalSuggestion);
        });
    }
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
