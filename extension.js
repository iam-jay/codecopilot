// extension.js
const vscode = require('vscode');
//const { OpenAI } = require('openai');
//process.env.OPENAI_API_KEY = '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'; // Replace with your actual OpenAI API key
//const openai = new OpenAI();
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const path = require('path');
const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");


const endpoint = "";
const credential = new AzureKeyCredential("");
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
    vscode.workspace.onDidChangeTextDocument(async event => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const language = getLanguage();
            const fullContent = activeEditor.document.getText();
            const line = activeEditor.document.lineAt(activeEditor.selection.active.line).text;

            // Check if the line starts with a specific comment marker
            if (line.includes('codecopilot suggest')) {
                // Check if the Tab key was pressed in the last change
                const lastChange = event.contentChanges[event.contentChanges.length - 1];
                const pressedEnter = lastChange.text.includes('\n');
                if (pressedEnter) {
                    // Extract the message and trigger suggestion request
                    const message = line.replace('codecopilot suggest', '').trim();
                    requestSuggestion(language, message);
                }
            }
            // else {
            //     // If not, check for space key presses
            //     const lastChange = event.contentChanges[event.contentChanges.length - 1];
            //     const typedChar = lastChange.text;

            //     if (typedChar.includes(' ')) {
            //         // Extract the input before the space
            //         const input = fullContent.substr(0, activeEditor.selection.active.character).trim();
    
            //         // Trigger suggestion request for the input
            //         requestSuggestion(language, input);
            //     }
            // }
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
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { scheme: 'file', language: '*' },
            new YourCompletionProvider(),
            // Trigger on specific delimiter characters
            '.' // Add more delimiters as needed
        )
    );
    console.log('Codecopilot extension activated.');
}

function getCurrentLanguage (){
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        const fileName = activeEditor.document.fileName;
        const fileExtension = fileName.split('.').pop();
        return languageMap[fileExtension] || null;
    }
    return null;
};

// get suggestion by running python script
async function getSuggestionsFromPythonScript(prompt) {
    const pythonScriptPath = path.resolve(__dirname, '../starter_code.py');  // Update with the actual path
    const command = `python ${pythonScriptPath} "${prompt}"`;
    console.log("python prompt: ", prompt);
    try {
        const { stdout } = await exec(command);
        const suggestions = stdout.trim();
        return suggestions;
    } catch (error) {
        console.error(`Error executing Python script: ${error.message}`);
        return [];
    }
}
function extractActualCodes(response) {
    const codeBlockStart = '```';
    const codeBlockEnd = '```';

    const startIndex = response.indexOf(codeBlockStart);
    const endIndex = response.indexOf(codeBlockEnd, startIndex + codeBlockStart.length);

    if (startIndex !== -1 && endIndex !== -1) {
        // Extract the code block content excluding the first line between code blocks
        const codeBlockContent = response
            .substring(startIndex + codeBlockStart.length, endIndex)
            .split('\n') // Split by newlines
            .filter((line, index) => index !== 0) // Exclude the second line
            .join('\n')
            .trim();

        return codeBlockContent;
    }
    else if(startIndex !== -1){
        const codeBlockContent = response
        .substring(startIndex + codeBlockStart.length, response.length-1)
        .split('\n') // Split by newlines
        .filter((line, index) => index !== 0) // Exclude the second line
        .join('\n')
        .trim();

        return codeBlockContent; 
    }

    return null;
}

class YourCompletionProvider {
    async provideCompletionItems(document, position, token, context) {
        // console.log('Autocompletion requested.');
        // const completionItems = [
        //     new vscode.CompletionItem('CompletionItem1'),
        //     new vscode.CompletionItem('CompletionItem2'),
        //     // Add more completion items as needed
        // ];

        // return completionItems;

        const fullContent = document.getText();
        // Get the current line of text before the cursor position
        const linePrefix = document.lineAt(position).text.substr(0, position.character);

        // Check if the line contains any of the specified delimiters
        if (linePrefix.includes('.')) {
            // Return completion items
            const suggestions = await getCodeCompletion(linePrefix);
            return await this.getCompletionItems(suggestions);
        }

        // return [];
    }

    async getCompletionItems(suggestions) {
        // let completionItems = [];
        // for(suggestion in suggestions){
        //     console.log(suggestion);
        //     completionItems.push(new vscode.CompletionItem(suggestion));
        //     console.log('suggestion added for completion');
        // }
        // console.log(completionItems);
        // return completionItems;
        const completionItems = await Promise.all(suggestions.map(suggestion => {
            console.log(suggestion);
            const completionItem = new vscode.CompletionItem(suggestion);
            console.log('suggestion added for completion');
            // Customize additional properties of the completion item if needed
            return completionItem;
        }));
        console.log(completionItems);
        return completionItems;

        // const completionItems = [
        //     new vscode.CompletionItem('CompletionItem1/'),
        //     new vscode.CompletionItem('CompletionItem2>'),
        //     // Add more completion items as needed
        // ];
        // console.log(completionItems);
        // return completionItems;
    }
}

// check if line is comment or not
// async function isLineComment(line, language) {
//     // Use the languages module to get comment tokens for the current language
//     const languageConfig = vscode.languages.getConfiguration(language);

//     if (languageConfig) {
//         // Check if there are line comment tokens in the language configuration
//         const commentTokens = languageConfig.get('comments.lineComment');
        
//         if (commentTokens && Array.isArray(commentTokens)) {
//             // Check if the line starts with any of the comment tokens
//             return commentTokens.some(token => line.trimLeft().startsWith(token));
//         }
//     }

//     return false;
// }


// Function to make the  request to local server to get suggestion
async function getSuggestionFRomServer(message) {
    const url = 'http://127.0.0.1:808/getsuggestion'; // Replace with your actual Flask server URL

    // JSON data to be sent in the request body
    const data = {
        prompt: message
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        // Check if the request was successful (status code 2xx)
        if (response.ok) {
            const jsonResponse = await response.json();
            const suggestion = jsonResponse.suggestion;
            console.log('Responses suggestion:', suggestion);
            return suggestion;
        } else {
            console.error('Error:', response.status, response.statusText);
        }
    } catch (error) {
        console.error('An error occurred:', error);
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

async function getCodeCompletion(prompt) {
    try {
        prepromt = `What all different Property Name tags starts with the prefix equal to the ${prompt} delimited by triple backticks. Please give only top 30 in formate of array with only postfix`;
        // const language = getCurrentLanguage();
        // prompt = "give possible words to auto complete. For your context code till here is " + prompt + " in " + language;
        // const messages = [
        //     { role: 'system', content: 'You are a code completioner. Talk like that. When I ask give me code auto complete. always return only autocomplete code suggestions in arra format. Do not return any extra text' },
        //     { role: 'user', content: prompt },
        // ];
        //const result = await client.getChatCompletions(deploymentId, messages, { maxTokens: 128 });
        //const content =  result.choices[0]['message']['content'];
        const content = await getSuggestionFRomServer(prepromt);
        // const content = ["Hello", "Hi", "HiFi"];
        vscode.window.showInformationMessage(`Result received: ${content}`);
        if(Array.isArray(content)){
            return content;
        }else{
            return JSON.parse(content);
        }
    } catch (error) {
        console.error('Error fetching chat suggestions:', error.message);
        return [];
    }
}

async function getCodeSuggestions(language, prompt) {
    try {
        prompt = "give code for " + prompt + "in " + language + ". Please return code no explanation required.";
        // const messages = [
        //         { role: 'system', content: 'You are AI and trained in all programming lanagues. When I ask for code only code and comments in that no explanation.' },
        //         { role: 'user', content: prompt },
        //     ];
        // const result = await client.getChatCompletions(deploymentId, messages, { maxTokens: 128 });
        // return result.choices[0]['message']['content'];
        const content = await getSuggestionFRomServer(prompt);
        vscode.window.showInformationMessage(`Suggestion received: ${content}`);
        return content
    } catch (error) {
        console.error('Error fetching chat suggestions:', error.message);
        return [];
    }
}

function storeSuggestion(language, suggestion) {
    // Your logic to store the suggestion based on language
    // For example, let's store it globally for simplicity
    globalSuggestion = extractActualCodes(suggestion);
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
        globalSuggestion = '';
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
            // const result = await client.getChatCompletions(deploymentId, messages, { maxTokens: 128 });
            // return result.choices[0]['message']['content'];
            return await getSuggestionFRomServer(prompt);
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

                    #chat-container div {
                        margin-bottom: 8px;
                    }

                    .user-message {
                        font-weight: bold;
                        color: blue; /* Set your preferred color */
                    }

                    .chatgpt-message {
                        font-weight: bold;
                        color: green; /* Set your preferred color */
                    }

                    code {
                        display: block;
                        white-space: pre-wrap;
                        background-color: #a69897; /* Set your preferred background color */
                        padding: 10px;
                        margin: 10px 0;
                        border-radius: 5px;
                        font-family: 'Courier New', Courier, monospace; /* Set your preferred font-family */
                    }
                </style>
                <script>
                    const vscode = acquireVsCodeApi();
    
                    async function sendChatMessage() {
                        const inputElement = document.getElementById('chat-input');
                        const userMessage = inputElement.value.trim();
    
                        if (userMessage !== '') {
                            const chatContainer = document.getElementById('chat-container');
                            chatContainer.innerHTML += '<div class="user-message">User: ' + userMessage + '</div>';
    
                            try {
                                // Call the API to get chat suggestions
                                //const suggestions = await vscode.postMessage({ command: 'getChatSuggestions', message: userMessage });

                                const suggestions = await new Promise(resolve => {
                                    vscode.postMessage({ command: 'getChatSuggestions', message: userMessage });
                                    // Listen for the response
                                    window.addEventListener('message', event => {
                                        if (event.data.command === 'receiveChatSuggestions') {
                                            resolve(event.data.suggestions);
                                        }
                                    });
                                });
                    
                                // Display suggestions in the chat container
                                receiveChatSuggestions(suggestions);
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
                        chatContainer.innerHTML += '<div class="chatgpt-message">ChatGPT: <code>' + suggestions + '</code></div>';
                        
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
    activate, YourCompletionProvider
};
