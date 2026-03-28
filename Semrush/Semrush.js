// ==UserScript==
// @name         Semrush数据导出Excel
// @namespace    http://tampermonkey.net/
// @version      2026-03-28
// @description  导出Semrush分析数据为Excel，支持翻译功能
// @author       Tommy
// @match        https://sem.3ue.co/analytics/organic/positions/*
// @match        https://sem.3ue.co/analytics/keywordmagic/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=www.semrush.com
// @connect      translate-pa.googleapis.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ==================== 配置 ====================
    const TRANSLATE_CONFIG = {
        selector: 'a[data-at="display-keyword"] span,a[class="swTable-content"]',
        apiUrl: 'https://translate-pa.googleapis.com/v1/translateHtml',
        apiKey: 'AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520',
        batchSize: 50,
        translatedClass: 'translated-text',
        translatedStyle: {
            marginTop: '0px',
            marginLeft: '0',
            color: '#666',
            fontSize: '0.9em',
            fontStyle: 'italic',
        },
    };

    // ==================== Excel导出功能 ====================

    function parseDisplayValue(str) {
        if (!str) return str;
        const ltMatch = str.match(/^<\s*([\d.]+)$/);
        if (ltMatch) return parseFloat(ltMatch[1]);
        const kMatch = str.match(/^([\d.]+)\s*[Kk]$/);
        if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);
        const mMatch = str.match(/^([\d.]+)\s*[Mm]$/);
        if (mMatch) return Math.round(parseFloat(mMatch[1]) * 1000000);
        return str;
    }

    function getTotalPages() {
        const pagination = document.querySelector('[data-ui-name="Pagination"]');
        if (!pagination) return null;
        const pageText = pagination.textContent;
        const match1 = pageText.match(/共\s*(\d+)\s*页/);
        if (match1) return parseInt(match1[1]);
        const match2 = pageText.match(/\/\s*([\d,]+)/);
        if (match2) {
            const num = parseInt(match2[1].replace(/,/g, ''));
            if (!isNaN(num)) return num;
        }
        const pageButtons = Array.from(pagination.querySelectorAll('button'))
            .map(btn => parseInt(btn.textContent.replace(/,/g, '')))
            .filter(n => !isNaN(n) && n > 0);
        return pageButtons.length > 0 ? Math.max(...pageButtons) : null;
    }

    function getCurrentDomain() {
        const input = document.querySelector('input[value*="."]');
        if (input && input.value) return input.value.trim();
        const urlParams = new URLSearchParams(window.location.search);
        const domain = urlParams.get('q');
        if (domain) return domain;
        return 'export';
    }

    function formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function getCurrentPage() {
        const pagination = document.querySelector('[data-ui-name="Pagination"]');
        if (!pagination) return 1;
        const activeButton = pagination.querySelector('button[aria-current="true"]');
        if (activeButton) {
            const pageNum = parseInt(activeButton.textContent);
            if (!isNaN(pageNum)) return pageNum;
        }
        const pageText = pagination.textContent;
        const match = pageText.match(/第\s*(\d+)\s*页/);
        if (match) return parseInt(match[1]);
        return 1;
    }

    function getCurrentPageData() {
        const table = document.querySelector('[data-ui-name="DataTable"]');
        if (!table) return null;
        const headers = Array.from(table.querySelectorAll('[role="columnheader"]'))
            .map(th => th.textContent.trim());
        const rows = Array.from(table.querySelectorAll('[role="row"]'))
            .slice(1)
            .map(row => {
                const cells = Array.from(row.querySelectorAll('[role="cell"], [role="gridcell"]'));
                return cells.map(cell => parseDisplayValue(cell.textContent.trim()));
            });
        return { headers, rows };
    }

    function clickNextPage() {
        const nextBtn = Array.from(document.querySelectorAll('[data-ui-name="Pagination"] button'))
            .find(btn => btn.textContent.includes('下一页') && !btn.disabled);
        if (nextBtn) {
            nextBtn.click();
            return true;
        }
        return false;
    }

    async function waitForPageLoad(oldFirstRowData) {
        const start = Date.now();
        while (Date.now() - start < 15000) {
            await new Promise(resolve => setTimeout(resolve, 300));
            const table = document.querySelector('[data-ui-name="DataTable"]');
            if (!table) continue;
            const firstRow = table.querySelector('[role="row"]:nth-child(2)');
            if (!firstRow) continue;
            const cells = firstRow.querySelectorAll('[role="cell"], [role="gridcell"]');
            const currentRowData = Array.from(cells).map(cell => cell.textContent.trim()).join('|');
            if (currentRowData && currentRowData !== oldFirstRowData && currentRowData.replace(/\|/g, '').length > 0) {
                break;
            }
        }
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    async function exportAllPages() {
        const button = document.getElementById('export-excel-btn');
        button.disabled = true;
        button.textContent = '准备中...';
        button.style.backgroundColor = '#999';
        button.style.cursor = 'not-allowed';

        await new Promise(resolve => setTimeout(resolve, 500));

        const currentPage = getCurrentPage();
        const totalPages = getTotalPages();

        if (!totalPages) {
            alert('无法读取总页数，请确认分页器已加载');
            button.textContent = '导出Excel';
            button.style.backgroundColor = '#4CAF50';
            button.style.cursor = 'pointer';
            button.disabled = false;
            return;
        }

        const remainingPages = totalPages - currentPage + 1;
        let pagesToExport = remainingPages;

        if (remainingPages > 20) {
            const input = prompt(`当前第 ${currentPage} 页，共 ${totalPages} 页，剩余 ${remainingPages} 页。\n请输入要导出的页数（1-${remainingPages}）：`, '20');
            if (input === null) {
                button.textContent = '导出Excel';
                button.style.backgroundColor = '#4CAF50';
                button.style.cursor = 'pointer';
                button.disabled = false;
                return;
            }
            const parsed = parseInt(input);
            if (!parsed || parsed < 1 || parsed > remainingPages) {
                alert(`请输入 1 到 ${remainingPages} 之间的整数`);
                button.textContent = '导出Excel';
                button.style.backgroundColor = '#4CAF50';
                button.style.cursor = 'pointer';
                button.disabled = false;
                return;
            }
            pagesToExport = parsed;
        }

        const endPage = currentPage + pagesToExport - 1;
        const allData = [];
        let headers = null;
        let pageCount = 0;
        const failedPages = [];

        try {
            for (let page = currentPage; page <= endPage; page++) {
                button.textContent = `导出中... ${page - currentPage + 1}/${pagesToExport}`;

                const data = getCurrentPageData();
                if (!data) {
                    failedPages.push(page);
                    break;
                }

                if (!headers) headers = data.headers;
                allData.push(...data.rows);
                pageCount++;

                if (page >= endPage) break;

                const table = document.querySelector('[data-ui-name="DataTable"]');
                const firstRow = table?.querySelector('[role="row"]:nth-child(2)');
                const cells = firstRow?.querySelectorAll('[role="cell"], [role="gridcell"]');
                const oldFirstRowData = cells ? Array.from(cells).map(cell => cell.textContent.trim()).join('|') : '';

                if (!clickNextPage()) {
                    console.log(`第 ${page} 页：无法点击下一页按钮`);
                    break;
                }

                await waitForPageLoad(oldFirstRowData);
            }

            const csv = [headers, ...allData]
                .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
                .join('\n');

            const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            const domain = getCurrentDomain();
            const dateStr = formatDate(new Date());
            link.download = `${domain}_${dateStr}_${pageCount}pages.csv`;
            link.click();

            button.textContent = failedPages.length > 0
                ? `导出完成(${pageCount}页，${failedPages.length}页失败)`
                : `导出完成(${pageCount}页)`;
            button.style.backgroundColor = '#2196F3';
        } catch (error) {
            button.textContent = '导出失败';
            button.style.backgroundColor = '#f44336';
            console.error(error);
        }

        setTimeout(() => {
            button.textContent = '导出Excel';
            button.style.backgroundColor = '#4CAF50';
            button.style.cursor = 'pointer';
            button.disabled = false;
        }, 3000);
    }

    function createExportButton() {
        if (document.getElementById('export-excel-btn')) return;
        const container = document.querySelector('[data-at="table-controls"],.kwo-one-line-layout,.export-buttons-wrapper,.FiltersContainer');
        if (!container) {
            setTimeout(createExportButton, 3000);
            return;
        }

        const button = document.createElement('button');
        button.id = 'export-excel-btn';
        button.textContent = '导出Excel';
        button.style.cssText = `
            background-color: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            height: 28px;
            min-width:100px;
            transition: background-color 0.3s;
        `;

        button.addEventListener('mouseenter', () => {
            if (!button.disabled) button.style.backgroundColor = '#45a049';
        });
        button.addEventListener('mouseleave', () => {
            if (!button.disabled) button.style.backgroundColor = '#4CAF50';
        });

        button.addEventListener('click', exportAllPages);
        container.prepend(button);
    }

    // ==================== 翻译功能 ====================

    async function batchTranslate(texts, targetLang = 'zh-CN', sourceLang = 'auto') {
        if (!texts || texts.length === 0) return [];
        try {
            const requestBody = [[texts, sourceLang, targetLang], "te_lib"];
            const response = await fetch(TRANSLATE_CONFIG.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json+protobuf',
                    'x-goog-api-key': TRANSLATE_CONFIG.apiKey,
                    'Accept': '*/*'
                },
                body: JSON.stringify(requestBody)
            });
            if (!response.ok) throw new Error(`API请求失败: ${response.status}`);
            const data = await response.json();
            return data[0] || [];
        } catch (error) {
            console.error('批量翻译失败:', error);
            return [];
        }
    }

    function createTranslatedSpan(translatedText) {
        const span = document.createElement('span');
        span.className = TRANSLATE_CONFIG.translatedClass;
        const textarea = document.createElement('textarea');
        textarea.innerHTML = translatedText;
        const decodedText = textarea.value;
        span.textContent = `(${decodedText})`;
        Object.assign(span.style, TRANSLATE_CONFIG.translatedStyle);
        return span;
    }

    async function translateAllElements() {
        const elements = document.querySelectorAll(TRANSLATE_CONFIG.selector);
        if (elements.length === 0) return;

        const untranslatedElements = Array.from(elements).filter(el => el.dataset.translated !== 'true');
        if (untranslatedElements.length === 0) return;

        const textsToTranslate = untranslatedElements
            .map(el => el.textContent.trim())
            .filter(text => text && !text.includes('http') && !text.includes('www.') && !/[\u4e00-\u9fa5]/.test(text));

        const allTranslations = [];
        for (let i = 0; i < textsToTranslate.length; i += TRANSLATE_CONFIG.batchSize) {
            const batch = textsToTranslate.slice(i, i + TRANSLATE_CONFIG.batchSize);
            const translations = await batchTranslate(batch);
            allTranslations.push(...translations);
            if (i + TRANSLATE_CONFIG.batchSize < textsToTranslate.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        untranslatedElements.forEach((element, index) => {
            const originalText = element.textContent.trim();
            const translatedText = allTranslations[index];
            if (translatedText && translatedText !== originalText) {
                element.dataset.translated = 'true';
                const translatedSpan = createTranslatedSpan(translatedText);
                if (element.nextSibling) {
                    element.parentNode.insertBefore(translatedSpan, element.nextSibling);
                } else {
                    element.parentNode.appendChild(translatedSpan);
                }
            }
        });
    }

    function addGoogleTrendsButtons() {
        const containers = document.querySelectorAll('.link-buttons-container');
        if (containers.length === 0) return;

        containers.forEach(container => {
            if (container.dataset.trendsAdded === 'true') return;
            const keywordElement = container.closest('.swTable-keywordCell')?.querySelector('.search-keyword a');
            if (!keywordElement) return;
            const keyword = keywordElement.textContent.trim();
            if (!keyword) return;

            const trendsUrl = `https://trends.google.com/trends/explore?q=${encodeURIComponent(keyword)},gpts&hl=zh-CN`;
            const link = document.createElement('a');
            link.href = trendsUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';

            const button = document.createElement('button');
            button.className = 'sc-hPOSDS sc-ljIkKL fzewgI eNSSTV Button sc-fHnHgl sc-hcfdRk gKLiws dKbdCe';
            button.setAttribute('data-automation-button-disabled', 'false');
            button.setAttribute('data-automation-button-type', 'flat');
            button.setAttribute('data-automation-button-loading', 'false');
            button.style.cssText = 'width: 32px; height: 32px;';

            const iconDiv = document.createElement('div');
            iconDiv.className = 'SWReactIcons sc-VHjGu bKmlYc';
            iconDiv.setAttribute('data-pdf-icon', 'SWReactIcons');
            iconDiv.setAttribute('data-automation-icon-name', 'google-trends');
            iconDiv.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path fill="#B0BAC8" fill-rule="evenodd" d="M3 13h2v7H3v-7zm4-4h2v11H7V9zm4-4h2v15h-2V5zm4 7h2v8h-2v-8zm4-3h2v11h-2V9z"></path>
                </svg>
            `;

            button.appendChild(iconDiv);
            link.appendChild(button);
            container.appendChild(link);
            container.dataset.trendsAdded = 'true';
        });
    }

    function createTranslateButton() {
        if (document.getElementById('translate-btn')) return;
        const filterLayout = document.querySelector('[data-at="table-controls"],.kwo-one-line-layout,.export-buttons-wrapper,.FiltersContainer');
        if (!filterLayout) {
            setTimeout(createTranslateButton, 3000);
            return;
        }

        const button = document.createElement('button');
        button.id = 'translate-btn';
        button.textContent = '关键字翻译';
        button.style.cssText = `
            background-color: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            height: 28px;
            min-width:100px;
            transition: background-color 0.3s;
        `;

        button.addEventListener('mouseenter', () => {
            if (!button.disabled) button.style.backgroundColor = '#45a049';
        });
        button.addEventListener('mouseleave', () => {
            if (!button.disabled) button.style.backgroundColor = '#4CAF50';
        });

        button.addEventListener('click', async () => {
            button.disabled = true;
            button.textContent = '翻译中...';
            button.style.backgroundColor = '#999';

            try {
                await translateAllElements();
                button.textContent = '翻译完成';
                button.style.backgroundColor = '#2196F3';
                setTimeout(() => {
                    button.textContent = '关键字翻译';
                    button.style.backgroundColor = '#4CAF50';
                    button.disabled = false;
                }, 3000);
            } catch (error) {
                console.error('翻译过程出错:', error);
                button.textContent = '翻译失败';
                button.style.backgroundColor = '#f44336';
                button.disabled = false;
            }
            addGoogleTrendsButtons();
        });

        filterLayout.prepend(button);
    }

    function adjustWidth() {
        if (document.getElementById('sw-width-override')) return;
        const style = document.createElement('style');
        style.id = 'sw-width-override';
        style.textContent = `.sw-layout-page, .sw-layout-page-max-width { max-width: 100% !important; margin: 0 auto; padding: 0 43px 50px; }`;
        document.head.appendChild(style);
    }

    // ==================== 初始化 ====================

    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                createExportButton();
                createTranslateButton();
            });
        } else {
            createExportButton();
            createTranslateButton();
        }
        adjustWidth();
        const observer = new MutationObserver(() => {
            createExportButton();
            createTranslateButton();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    init();

    window.TranslatePlugin = {
        translate: translateAllElements,
        batchTranslate: batchTranslate,
        config: TRANSLATE_CONFIG
    };

})();
