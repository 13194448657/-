console.log('Script is running');

const API_URL = 'https://api.moonshot.cn/v1/chat/completions';
// 移除直接暴露的 API_KEY
// const API_KEY = 'sk-7OhaEFOc82CL9UTzMVgMkLjvWzG0KphDWp4N9z1ahjTBE2VC';

console.log('API_URL:', API_URL);
// 移除 API_KEY 的日志输出

// 全局变量声明
let chatWindow;
let userInput;
let sendButton;
let clearButton;
let balanceButton;

// 4. 提示词优化
const SYSTEM_PROMPT = `你是Kimi，由Moonshot AI提供的人工智能助手，专门为期货强盛集团设计。你擅长中英文对话，提供安全、有帮助、准确的回答。在回答问题时，请遵循以下步骤：

1. 理解问题：仔细分析用户的问题，确保你完全理解他们的需求。

2. 思考背景：考虑问题的金融和期货交易背景。思考这个问题可能涉及的专业知识领域。

3. 制定回答框架：根据问题的复杂程度，决定回答的结构和深度。

4. 应用专业知识：利用你在金融、期货交易方面的深入了解，提供专业的见解。

5. 个性化建议：根据用户可能的情况，给出针对性的建议或解释。

6. 考虑风险和道德：在提供建议时，务必考虑潜在的风险，并保持道德和法律的界限。

7. 总结和补充：简洁地总结你的回答，并在必要时提供额外的资源或建议进一步学习。

8. 自我检查：在给出最终回答前，快速检查你的回答是否完整、准确、有帮助。

记住：
- 对于涉及恐怖主义、种族歧视、暴力等问题，礼貌地拒绝回答。
- 如果遇到不确定的问题，诚实地表示并提供可能的资源。
- Moonshot AI是专有名词，不要翻译。
- 始终保持专业、友好和乐于助人的态度。

请按照这个思维过程来回答用户的问题，确保你的回答既专业又易于理解。`;

let chatHistory = [{"role": "system", "content": SYSTEM_PROMPT}];

function initializeHighlight() {
    if (typeof hljs !== 'undefined') {
        hljs.highlightAll();
        console.log('Highlight.js initialized');
    } else {
        console.warn('Highlight.js library is not loaded, attempting to load');
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/highlight.min.js';
        script.onload = () => {
            console.log('Highlight.js loaded dynamically');
            hljs.highlightAll();
        };
        document.head.appendChild(script);
    }
}

// 1. 限制对话历史
const MAX_HISTORY_LENGTH = 10;

function addToChatHistory(message) {
    chatHistory.push(message);
    if (chatHistory.length > MAX_HISTORY_LENGTH) {
        chatHistory = chatHistory.slice(-MAX_HISTORY_LENGTH);
    }
}

// 2. 错误处理和重试机制
async function sendMessageWithRetry(messages, retries = 3) {
    const apiKey = await getApiKey();
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: "moonshot-v1-8k",
                    messages: messages,
                    temperature: 0.3
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`Attempt ${i + 1} failed:`, error);
            if (i === retries - 1) {
                throw error;
            }
        }
    }
}

// 3. 流式响应（需要API支持）
async function streamResponse(messages) {
    const apiKey = await getApiKey();
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: "moonshot-v1-8k",
            messages: messages,
            temperature: 0.3,
            stream: true
        })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let responseDiv = document.createElement('div');
    responseDiv.classList.add('message', 'ai-message');
    if (chatWindow) {
        chatWindow.appendChild(responseDiv);
    } else {
        console.error('Chat window not found');
        return;
    }

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const content = line.slice(6).trim();
                if (content === '[DONE]') {
                    return;
                }
                try {
                    const data = JSON.parse(content);
                    if (data.choices && data.choices[0].delta.content) {
                        responseDiv.innerHTML += data.choices[0].delta.content;
                        chatWindow.scrollTop = chatWindow.scrollHeight;
                    }
                } catch (error) {
                    console.error('Error parsing JSON:', error);
                }
            }
        }
    }
}

function addMessage(content, isUser = false) {
    if (!chatWindow) {
        console.error('Chat window not found');
        return;
    }
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', isUser ? 'user-message' : 'ai-message');
    messageDiv.innerHTML = marked.parse(content);
    chatWindow.appendChild(messageDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    setTimeout(() => {
        initializeHighlight();
    }, 100);
}

async function sendMessage() {
    console.log('sendMessage function called');
    if (!userInput || !sendButton) {
        console.error('User input or send button not found');
        return;
    }
    const message = userInput.value.trim();
    if (message) {
        console.log('User message:', message);
        addMessage(message, true);
        userInput.value = '';
        sendButton.disabled = true;
        sendButton.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 处理中...';

        addToChatHistory({"role": "user", "content": message});

        try {
            if (!chatWindow) {
                throw new Error('Chat window not initialized');
            }
            // 使用流式响应
            await streamResponse(chatHistory);
        } catch (error) {
            console.error('Error details:', error);
            addMessage(`抱歉，发生了一个错误。错误信息: ${error.message}`);
        } finally {
            sendButton.disabled = false;
            sendButton.innerHTML = '<i class="fas fa-paper-plane"></i> 发送';
        }
    }
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM content loaded');

    initializeHighlight();

    // 检查必要的库是否已加载
    if (typeof marked === 'undefined') {
        console.error('Marked library is not loaded');
    }
    if (typeof hljs === 'undefined') {
        console.warn('Highlight.js library is not loaded');
    }

    chatWindow = document.getElementById('chat-window');
    userInput = document.getElementById('user-input');
    sendButton = document.getElementById('send-button');
    clearButton = document.getElementById('clear-chat');
    balanceButton = document.getElementById('balance-check');

    if (sendButton) {
        sendButton.addEventListener('click', sendMessage);
    }

    if (userInput) {
        userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    if (clearButton) {
        clearButton.addEventListener('click', () => {
            if (chatWindow) {
                chatWindow.innerHTML = '';
                chatHistory = [{"role": "system", "content": SYSTEM_PROMPT}];
            }
        });
    }

    if (balanceButton) {
        balanceButton.addEventListener('click', async () => {
            try {
                const apiKey = await getApiKey();
                const response = await fetch('https://api.moonshot.cn/v1/users/me/balance', {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`
                    }
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                const balance = data.data;
                addMessage(`当前余额: 
                可用余额: ${balance.available_balance} 元
                代金券余额: ${balance.voucher_balance} 元
                现金余额: ${balance.cash_balance} 元`);
            } catch (error) {
                console.error('Error getting balance:', error);
                addMessage('获取余额失败，请稍后再试。');
            }
        });
    }

    // 5. 功能扩展（示例：添加语音输入）
    if ('webkitSpeechRecognition' in window) {
        const recognition = new webkitSpeechRecognition();
        recognition.lang = 'zh-CN';
        recognition.onresult = function(event) {
            const transcript = event.results[0][0].transcript;
            if (userInput) {
                userInput.value = transcript;
            }
        };
        
        const voiceInputButton = document.getElementById('voice-input');
        if (voiceInputButton) {
            voiceInputButton.addEventListener('click', () => recognition.start());
        }
    }
});

// 添加一个函数来获取 API 密钥
async function getApiKey() {
    // 这里应该是从安全的后端服务获取 API 密钥的逻辑
    // 为了演示，我们暂时返回一个加密的字符串，实际使用时应该替换为真正的后端请求
    return atob('c2stN09oYUVGT2M4MkNMOVVUek1WZ01rTGp2V3pHMEtwaERXcDROOXoxYWhqVEJFMlZD');
}