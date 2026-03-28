// ==UserScript==
// @name         SEO翻译工具
// @namespace    http://tampermonkey.net/
// @version      2025-12-20
// @description  try to take over the world!
// @author       You
// @match        https://sem.3ue.co/analytics/keywordmagic/*
// @match        https://sem.3ue.co/analytics/organic/positions/*
// @match        https://sim.3ue.co/
// @connect      translate-pa.googleapis.com
// @connect      translate.googleapis.com
// @icon         https://www.google.com/s2/favicons?sz=64&domain=3ue.co
// @grant        none
// ==/UserScript==


/**
 * 自动翻译插件
 * 找到所有 data-ui-name="Link.Text" 的 span 元素，翻译成中文并显示
 * Google翻译插件 - 使用translateHtml批量API
 * 支持真正的批量翻译，性能更好
 */

(function () {
    'use strict';

    // 配置
    const CONFIG = {
        selector: 'a[data-at="display-keyword"] span,a[class="swTable-content"]',
        // Google翻译批量API
        apiUrl: 'https://translate-pa.googleapis.com/v1/translateHtml',
        // API密钥（从Chrome翻译扩展提取）
        apiKey: 'AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520',
        // 批量翻译的批次大小
        batchSize: 50,
        translatedClass: 'translated-text',
        translatedStyle: {
            marginTop: '0px',        // 上边距
            marginLeft: '0',         // 左边距改为0
            color: '#666',
            fontSize: '0.9em',
            fontStyle: 'italic',

        },
    };

    /**
     * 使用批量API翻译多个文本
     * @param {string[]} texts - 要翻译的文本数组
     * @param {string} targetLang - 目标语言
     * @param {string} sourceLang - 源语言
     * @returns {Promise<string[]>} 翻译结果数组
     */
    async function batchTranslate(texts, targetLang = 'zh-CN', sourceLang = 'auto') {
        if (!texts || texts.length === 0) {
            return [];
        }

        try {
            // 构建请求体
            const requestBody = [
                [texts, sourceLang, targetLang],
                "te_lib"
            ];

            const response = await fetch(CONFIG.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json+protobuf',
                    'x-goog-api-key': CONFIG.apiKey,
                    'Accept': '*/*'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            // 返回格式: [["翻译1","翻译2",...]]
            return data[0] || [];

        } catch (error) {
            console.error('批量翻译失败:', error);
            return [];
        }
    }

    /**
     * 创建翻译结果的span元素
     * @param {string} translatedText - 翻译后的文本
     * @returns {HTMLSpanElement} 翻译结果元素
     */
    function createTranslatedSpan(translatedText) {
        const span = document.createElement('span');
        span.className = CONFIG.translatedClass;

        // 解码HTML实体（如 &#39; -> '）
        const textarea = document.createElement('textarea');
        textarea.innerHTML = translatedText;
        const decodedText = textarea.value;

        span.textContent = `(${decodedText})`;

        // 应用样式
        Object.assign(span.style, CONFIG.translatedStyle);

        return span;
    }

    /**
     * 翻译所有匹配的元素
     */
    async function translateAllElements() {
        const elements = document.querySelectorAll(CONFIG.selector);
        console.log(`找到 ${elements.length} 个需要翻译的元素`);

        if (elements.length === 0) {
            console.log('没有找到需要翻译的元素');
            return;
        }

        // 过滤出未翻译的元素
        const untranslatedElements = Array.from(elements).filter(
            el => el.dataset.translated !== 'true'
        );

        if (untranslatedElements.length === 0) {
            console.log('所有元素已翻译');
            return;
        }

        console.log(`需要翻译 ${untranslatedElements.length} 个元素`);

        // 收集所有需要翻译的文本（排除URL和已有中文的）
        const textsToTranslate = untranslatedElements
            .map(el => el.textContent.trim())
            .filter(text => text && !text.includes('http') && !text.includes('www.') && !/[\u4e00-\u9fa5]/.test(text));

        // 分批翻译
        const allTranslations = [];
        for (let i = 0; i < textsToTranslate.length; i += CONFIG.batchSize) {
            const batch = textsToTranslate.slice(i, i + CONFIG.batchSize);
            console.log(`正在翻译第 ${Math.floor(i / CONFIG.batchSize) + 1} 批，共 ${batch.length} 个文本`);

            const translations = await batchTranslate(batch);
            allTranslations.push(...translations);

            // 添加小延迟，避免请求过快
            if (i + CONFIG.batchSize < textsToTranslate.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        // 将翻译结果应用到元素
        untranslatedElements.forEach((element, index) => {
            const originalText = element.textContent.trim();
            const translatedText = allTranslations[index];

            if (translatedText && translatedText !== originalText) {
                // 标记为已翻译
                element.dataset.translated = 'true';

                // 创建翻译结果span
                const translatedSpan = createTranslatedSpan(translatedText);

                // 在原元素后面插入翻译结果
                if (element.nextSibling) {
                    element.parentNode.insertBefore(translatedSpan, element.nextSibling);
                } else {
                    element.parentNode.appendChild(translatedSpan);
                }
            }
        });

        console.log('翻译完成');
    }

    /**
     * 创建翻译按钮
     */
    function createTranslateButton() {
        // 检查按钮是否已存在
        if (document.getElementById('translate-btn')) {
            return;
        }

        // 查找容器元素
        const filterLayout = document.querySelector('[data-at="table-controls"],.kwo-one-line-layout,.export-buttons-wrapper,.FiltersContainer');

        if (!filterLayout) {
            console.warn('未找到容器元素，将在3秒后重试');
            setTimeout(createTranslateButton, 3000);
            return;
        }

        const button = document.createElement('button');
        button.id = 'translate-btn';
        button.textContent = '关键字翻译';
        button.style.cssText = `
            padding: 8px 16px;
            background-color: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin: 5px;
            transition: background-color 0.3s;
        `;

        // 鼠标悬停效果
        button.addEventListener('mouseenter', () => {
            button.style.backgroundColor = '#45a049';
        });
        button.addEventListener('mouseleave', () => {
            button.style.backgroundColor = '#4CAF50';
        });

        // 点击事件
        button.addEventListener('click', async () => {
            button.disabled = true;
            button.textContent = '翻译中...';
            button.style.backgroundColor = '#999';

            try {
                await translateAllElements();
                button.textContent = '翻译完成';
                button.style.backgroundColor = '#2196F3';

                // 3秒后恢复按钮状态
                setTimeout(() => {
                    button.textContent = '翻译成中文';
                    button.style.backgroundColor = '#4CAF50';
                    button.disabled = false;
                }, 3000);
            } catch (error) {
                console.error('翻译过程出错:', error);
                button.textContent = '翻译失败，点击重试';
                button.style.backgroundColor = '#f44336';
                button.disabled = false;
            }
              addGoogleTrendsButtons();
        });

        filterLayout.prepend(button);
        console.log('翻译按钮已添加到 .sm-filter-layout');


    }

    /**
     * 为每个关键字添加Google Trends按钮
     */
    function addGoogleTrendsButtons() {
        const containers = document.querySelectorAll('.link-buttons-container');

        if (containers.length === 0) {
            return;
        }

        containers.forEach(container => {
            // 检查是否已添加按钮
            if (container.dataset.trendsAdded === 'true') {
                return;
            }

            // 获取关键字
            const keywordElement = container.closest('.swTable-keywordCell')?.querySelector('.search-keyword a');
            if (!keywordElement) {
                return;
            }

            const keyword = keywordElement.textContent.trim();
            if (!keyword) {
                return;
            }

            // 创建Google Trends链接
            const trendsUrl = `https://trends.google.com/trends/explore?q=${encodeURIComponent(keyword)},gpts&hl=zh-CN`;

            // 创建按钮容器（a标签）
            const link = document.createElement('a');
            link.href = trendsUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';

            // 创建按钮
            const button = document.createElement('button');
            button.className = 'sc-hPOSDS sc-ljIkKL fzewgI eNSSTV Button sc-fHnHgl sc-hcfdRk gKLiws dKbdCe';
            button.setAttribute('data-automation-button-disabled', 'false');
            button.setAttribute('data-automation-button-type', 'flat');
            button.setAttribute('data-automation-button-loading', 'false');
            button.style.cssText = 'width: 32px; height: 32px;';

            // 创建图标容器
            const iconDiv = document.createElement('div');
            iconDiv.className = 'SWReactIcons sc-VHjGu bKmlYc';
            iconDiv.setAttribute('data-pdf-icon', 'SWReactIcons');
            iconDiv.setAttribute('data-automation-icon-name', 'google-trends');

            // 创建SVG图标（使用简单的趋势图标）
            iconDiv.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path fill="#B0BAC8" fill-rule="evenodd" d="M3 13h2v7H3v-7zm4-4h2v11H7V9zm4-4h2v15h-2V5zm4 7h2v8h-2v-8zm4-3h2v11h-2V9z"></path>
                </svg>
            `;

            // 组装元素
            button.appendChild(iconDiv);
            link.appendChild(button);
            container.appendChild(link);

            // 标记已添加
            container.dataset.trendsAdded = 'true';
        });

        console.log(`已为 ${containers.length} 个关键字添加Google Trends按钮`);
    }


    function adjustWidth() {
        if (document.getElementById('sw-width-override')) return;
        const style = document.createElement('style');
        style.id = 'sw-width-override';
        style.textContent = `.sw-layout-page, .sw-layout-page-max-width { max-width: 100% !important; margin: 0 auto; padding: 0 43px 50px; }`;
        document.head.appendChild(style);
    }


    /**
     * 防抖函数 - 避免频繁调用
     */
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    }

    /**
     * 初始化插件
     */
    function init() {
        console.log('翻译插件已加载（批量API版本）');
        console.log('使用 Google translateHtml API 进行批量翻译');

        // 等待DOM加载完成后创建按钮
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                createTranslateButton();
            });
        } else {
            createTranslateButton();
        }

        // 创建防抖版本的按钮创建函数
        const debouncedAddButtons = debounce(() => {
            createTranslateButton();

        }, 300);

        // 监听DOM变化，自动添加按钮
        const observer = new MutationObserver(debouncedAddButtons);
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        console.log('DOM变化监听已启动');
         adjustWidth();
    }


    // 启动插件
    init();

    // 暴露API供外部调用
    window.TranslatePlugin = {
        translate: translateAllElements,
        batchTranslate: batchTranslate,
        config: CONFIG
    };

})();
