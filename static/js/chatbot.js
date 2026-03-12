// static/js/chatbot.js - GPT-trainer Chatbot Integration

(function() {
    console.log("🤖 Chatbot messenger loaded");
    
    // Wait for DOM to be fully loaded
    document.addEventListener('DOMContentLoaded', function() {
        
        const messageData = {
            type: "gpt_website_tracker_url",
            full_url: window.location.href,
        };

        let attempts = 0;
        const MAX_ATTEMPTS = 30;

        function setupChatbotMessaging() {
            attempts++;
            const iframeElement = document.getElementById("chatbot-widget-window-iframe");

            if (iframeElement && iframeElement.contentWindow) {
                console.log("✅ Chatbot iframe found, setting up message listener");
                
                window.addEventListener("message", function (event) {
                    const { data } = event;

                    if (data?.type === "gpt_chatbot_state" && data?.payload?.ready) {
                        iframeElement.contentWindow.postMessage(messageData, "*");
                        console.log("✅ Chatbot ready message sent");
                    }
                });
                
                console.log("✅ Chatbot messaging setup complete");
                
            } else {
                if (attempts < MAX_ATTEMPTS) {
                    console.log(`⏳ Waiting for chatbot iframe... (attempt ${attempts}/${MAX_ATTEMPTS})`);
                    setTimeout(setupChatbotMessaging, 1000);
                } else {
                    console.log("❌ Chatbot iframe not found after maximum attempts");
                }
            }
        }

        // Start the setup
        setupChatbotMessaging();
    });
})();