document.addEventListener('DOMContentLoaded', () => {
    // PWA: Service Worker Registration
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    // PWA: Install Prompt
    let deferredPrompt = null;
    const installOverlay = getElement('install-overlay');
    const installOkBtn = getElement('install-ok');
    const installCancelBtn = getElement('install-cancel');

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        // Show custom prompt if not dismissed before
        if (!localStorage.getItem('installDismissed')) {
            if (installOverlay) installOverlay.classList.remove('hidden');
        }
    });

    if (installOkBtn) {
        installOkBtn.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            if (installOverlay) installOverlay.classList.add('hidden');
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            deferredPrompt = null;
        });
    }

    if (installCancelBtn) {
        installCancelBtn.addEventListener('click', () => {
            if (installOverlay) installOverlay.classList.add('hidden');
            localStorage.setItem('installDismissed', 'true');
        });
    }

    // Helper to get element safely
    const getElement = (id) => document.getElementById(id);

    // Elements
    const settingsToggle = getElement('settings-toggle');
    const closeSettings = getElement('close-settings');
    const settingsPanel = getElement('settings-panel');
    const apiKeyInput = getElement('api-key');
    const geminiModelSelect = getElement('gemini-model');
    const systemPromptInput = getElement('system-prompt');
    const saveSettingsBtn = getElement('save-settings');
    const toggleApiVisibilityBtn = getElement('toggle-api-visibility');
    const footerModel = getElement('footer-model');

    const targetText = getElement('target-text');
    const pasteBtn = getElement('paste-btn');
    const clearBtn = getElement('clear-btn');
    const generateBtn = getElement('generate-btn');
    const generateQuoteBtn = getElement('generate-quote-btn');
    const cancelBtn = getElement('cancel-btn');
    const resultArea = getElement('result-area');
    const resultHeading = getElement('result-heading');
    const copyBtns = document.querySelectorAll('.copy-btn');

    let currentAbortController = null;

    const errorMessage = getElement('error-message');
    const successMessage = getElement('success-message');

    // Load Settings from localStorage
    function loadSettings() {
        const apiKey = localStorage.getItem('geminiApiKey');
        const model = localStorage.getItem('geminiModel');
        const prompt = localStorage.getItem('systemPrompt');

        if (apiKey && apiKeyInput) apiKeyInput.value = apiKey;
        if (model && geminiModelSelect) geminiModelSelect.value = model;
        if (prompt && systemPromptInput) systemPromptInput.value = prompt;

        updateFooterModel();
    }

    loadSettings();

    function updateFooterModel() {
        if (!footerModel || !geminiModelSelect) return;
        const selectedOption = geminiModelSelect.options[geminiModelSelect.selectedIndex];
        footerModel.textContent = selectedOption.text.split('（')[0].trim();
    }

    // Toggle Settings Panel
    if (settingsToggle) {
        settingsToggle.addEventListener('click', () => {
            if (settingsPanel) settingsPanel.classList.remove('hidden');
        });
    }

    if (closeSettings) {
        closeSettings.addEventListener('click', () => {
            if (settingsPanel) settingsPanel.classList.add('hidden');
        });
    }

    // Toggle API Key Visibility
    if (toggleApiVisibilityBtn && apiKeyInput) {
        toggleApiVisibilityBtn.addEventListener('click', () => {
            if (apiKeyInput.type === 'password') {
                apiKeyInput.type = 'text';
                toggleApiVisibilityBtn.textContent = '🙈';
            } else {
                apiKeyInput.type = 'password';
                toggleApiVisibilityBtn.textContent = '👁️';
            }
        });
    }

    // Save Settings to localStorage
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', () => {
            if (!apiKeyInput) return;

            const apiKey = apiKeyInput.value.trim();
            const prompt = systemPromptInput ? systemPromptInput.value.trim() : '';

            if (!apiKey) {
                showError('APIキーを入力してください');
                return;
            }

            const model = geminiModelSelect ? geminiModelSelect.value : 'gemini-2.5-flash';

            localStorage.setItem('geminiApiKey', apiKey);
            localStorage.setItem('geminiModel', model);
            localStorage.setItem('systemPrompt', prompt);

            updateFooterModel();
            showSuccess('設定を保存しました');
            if (settingsPanel) settingsPanel.classList.add('hidden');
        });
    }

    // Paste from clipboard
    if (pasteBtn) {
        pasteBtn.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (targetText) {
                    targetText.value = text;
                    checkGenerateButton();
                    showSuccess('貼り付けました');
                }
            } catch {
                showError('クリップボードへのアクセスが許可されていません');
            }
        });
    }

    // Clear Inputs
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (targetText) targetText.value = '';
            checkGenerateButton();
            showSuccess('クリアしました');
        });
    }

    // Check generate button state
    if (targetText) {
        targetText.addEventListener('input', checkGenerateButton);
    }

    function checkGenerateButton() {
        if (!targetText) return;
        const hasText = targetText.value.trim().length > 0;
        if (generateBtn) generateBtn.disabled = !hasText;
        if (generateQuoteBtn) generateQuoteBtn.disabled = !hasText;
    }

    // Common generate function
    async function handleGenerate(type) {
        if (!targetText) return;
        const text = targetText.value.trim();
        if (!text) return;

        const apiKey = localStorage.getItem('geminiApiKey');
        const model = localStorage.getItem('geminiModel') || 'gemini-2.5-flash';
        const basePrompt = localStorage.getItem('systemPrompt') || 'あなたはフレンドリーなSNSユーザーです。相手の投稿に共感し、短い返信を作成してください。';

        if (!apiKey) {
            showError('APIキーが設定されていません。設定画面から入力してください。');
            if (settingsPanel) settingsPanel.classList.remove('hidden');
            return;
        }

        let instruction;
        if (type === 'reply') {
            instruction = `${basePrompt}

【重要】
対象の投稿に対して、以下の3つの異なる切り口（アプローチ）でリプライ案を作成してください。
1. 共感・同意（相手の気持ちに寄り添う）
2. 質問・深掘り（会話を広げる）
3. ユニーク・ユーモア（少し違った視点や面白い返し）

【出力形式】
必ず3つのリプライ案を出力してください。各案は「---」で区切ります。
余計な前置き、ラベル、説明は一切不要です。返信本文のみを出力してください。

例:
こんにちは！素敵ですね！
---
それってどういうことですか？もっと聞きたいです！
---
斜め上からの感想だけど、最高すぎる笑
`;
        } else {
            instruction = `${basePrompt}

【重要】
対象の投稿を「引用ポスト（引用リポスト）」する文章を作成してください。
引用ポストとは、相手のポストを引用しながら自分のコメントを添えて投稿する形式です。
リプライ（返信）ではなく、自分のタイムラインに投稿する文章です。

以下の3つの異なる切り口で引用ポスト案を作成してください。

1. 感想・共感型（内容を読んで感じたこと、共感したポイントを中心に書く）
2. 学び・有益ポイント型（どこが有益だったか、どんな気づきがあったかを具体的に伝える）
3. 自分の意見・体験型（自分の考えや経験を添えて、独自の視点を加える）

【引用ポストのポイント】
- 元の投稿の内容を踏まえて、自分なりの価値を加える
- 「これ読んでほしい」「まさにこれ」のような共有動機を自然に含める
- 自分のフォロワーに向けて語りかける意識で書く
- 200文字以内で簡潔にまとめる

【出力形式】
必ず3つの引用ポスト案を出力してください。各案は「---」で区切ります。
余計な前置き、ラベル、説明は一切不要です。引用ポスト本文のみを出力してください。

例:
これめちゃくちゃ大事。私も最初は全然できなかったけど、環境を変えたら一気に変わった。現状維持は衰退、ほんとそう思う。
---
この投稿の「まず小さく始める」ってところが刺さった。完璧を目指すより、まず動く。これに気づくまで私は1年かかりました。
---
私も同じ経験があるからわかるけど、ここに書いてあること実践したら本当に結果変わる。特にフリーランスの人は読んでほしい。
`;
        }

        const activeBtn = type === 'reply' ? generateBtn : generateQuoteBtn;
        currentAbortController = new AbortController();
        showLoader(true, activeBtn, type);
        if (resultArea) resultArea.classList.add('hidden');

        try {
            const replyFull = await callGeminiApi(apiKey, model, instruction, text, currentAbortController.signal);

            const replies = replyFull.split('---').map(r => r.trim()).filter(r => r.length > 0);

            const reply1 = getElement('reply-1');
            const reply2 = getElement('reply-2');
            const reply3 = getElement('reply-3');

            if (reply1) reply1.textContent = replies[0] || '生成エラー';
            if (reply2) reply2.textContent = replies[1] || '（生成されませんでした）';
            if (reply3) reply3.textContent = replies[2] || '（生成されませんでした）';

            if (resultHeading) {
                resultHeading.textContent = type === 'reply' ? '生成されたリプライ案' : '生成された引用ポスト案';
            }

            if (resultArea) {
                resultArea.classList.remove('hidden');
                resultArea.scrollIntoView({ behavior: 'smooth' });
            }

        } catch (error) {
            if (error.name === 'AbortError') {
                showSuccess('キャンセルしました');
            } else {
                console.error(error);
                showError('生成に失敗しました: ' + error.message);
            }
        } finally {
            currentAbortController = null;
            showLoader(false, activeBtn, type);
        }
    }

    // Generate Reply
    if (generateBtn) {
        generateBtn.addEventListener('click', () => handleGenerate('reply'));
    }

    // Generate Quote Post
    if (generateQuoteBtn) {
        generateQuoteBtn.addEventListener('click', () => handleGenerate('quote'));
    }

    // Cancel generation
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            if (currentAbortController) {
                currentAbortController.abort();
            }
        });
    }

    // Copy to Clipboard
    if (copyBtns) {
        copyBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.getAttribute('data-target');
                const targetEl = getElement(targetId);
                if (!targetEl) return;

                const text = targetEl.textContent;
                navigator.clipboard.writeText(text).then(() => {
                    btn.classList.add('copied');
                    showSuccess('コピーしました！');
                    setTimeout(() => btn.classList.remove('copied'), 1500);
                }, () => {
                    showError('コピーに失敗しました');
                });
            });
        });
    }

    // Helper Functions
    function showLoader(isLoading, btn, type) {
        if (!btn) return;
        const btnText = btn.querySelector('.text');
        const spinner = btn.querySelector('.loader');

        if (isLoading) {
            if (generateBtn) generateBtn.disabled = true;
            if (generateQuoteBtn) generateQuoteBtn.disabled = true;
            if (btnText) btnText.textContent = '生成中...';
            if (spinner) spinner.classList.remove('hidden');
            if (cancelBtn) cancelBtn.classList.remove('hidden');
        } else {
            checkGenerateButton();
            if (btnText) btnText.textContent = type === 'reply' ? 'リプライ生成 ✨' : '引用ポスト生成 🔁';
            if (spinner) spinner.classList.add('hidden');
            if (cancelBtn) cancelBtn.classList.add('hidden');
        }
    }

    function showError(msg) {
        if (!errorMessage) return;
        errorMessage.textContent = msg;
        errorMessage.classList.remove('hidden');
        errorMessage.style.animation = 'none';
        errorMessage.offsetHeight;
        errorMessage.style.animation = 'fadeIn 0.3s ease-out';

        setTimeout(() => {
            errorMessage.classList.add('hidden');
        }, 3000);
    }

    function showSuccess(msg) {
        if (!successMessage) return;
        successMessage.textContent = msg;
        successMessage.classList.remove('hidden');
        successMessage.style.animation = 'none';
        successMessage.offsetHeight;
        successMessage.style.animation = 'fadeIn 0.3s ease-out';

        setTimeout(() => {
            successMessage.classList.add('hidden');
        }, 3000);
    }

    async function callGeminiApi(apiKey, model, systemPrompt, userText, signal) {
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const payload = {
            contents: [
                {
                    role: "user",
                    parts: [
                        { text: `System Instruction: ${systemPrompt}` },
                        { text: `Target Post Content: ${userText}` },
                        { text: "Generate the reply variations as requested." }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.8,
                maxOutputTokens: 2048,
            }
        };

        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload),
            signal: signal
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || 'API request failed');
        }

        if (!data.candidates || data.candidates.length === 0) {
            const reason = data.promptFeedback?.blockReason;
            throw new Error(reason ? `ブロックされました: ${reason}` : 'レスポンスが空です');
        }

        const parts = data.candidates[0].content?.parts;
        if (!parts || parts.length === 0) {
            throw new Error('レスポンスの内容が空です');
        }

        // 2.5系モデルはthinkingパートを含む場合があるので、textパートのみ取得
        const textParts = parts.filter(p => p.text !== undefined && !p.thought);
        if (textParts.length === 0) {
            throw new Error('テキストレスポンスが見つかりません');
        }

        return textParts.map(p => p.text).join('');
    }
});
