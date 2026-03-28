// ==UserScript==
// @name         Semrush&SimilarWeb工具
// @namespace    http://tampermonkey.net/
// @version      2026-03-28
// @description  导出数据为Excel，支持翻译功能
// @author       Tommy
// @match        https://sem.3ue.co/analytics/*
// @match        https://sim.3ue.co/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=3ue.co
// @connect      translate-pa.googleapis.com
// @require      https://unpkg.com/xlsx/dist/xlsx.full.min.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ==================== 配置 ====================
    const TRANSLATE_CONFIG = {
        selector: 'a[data-at="display-keyword"] span,a[class="swTable-content"],div[data-testid="table-cell-keyword"] a span ',
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

    const BUTTON_COLORS = {
        primary: '#FF9800',
        primaryDark: '#F57C00',
        primaryLight: '#FFB74D',
        loading: '#999',
        success: '#52c41a',
        error: '#f44336'
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

    // ==================== SimilarWeb 专用函数 ====================
 

  

    function extractHeaders_SimilarWeb() {
        const columns = document.querySelectorAll('.swReactTable-column');
        if (columns.length === 0) return null;
        const headers = [];
        columns.forEach(col => {
            const headerCell = col.querySelector('.swReactTableHeaderCell [data-automation="header-cell.text"]');
            if (headerCell) {
                headers.push(headerCell.textContent.trim());
            }
        });
        return headers;
    }

    function extractRowData_SimilarWeb(tr) {
        const tds = tr.querySelectorAll('td');
        if (tds.length < 17) return null;
        const get = (td) => td ? td.textContent.trim() : '';
        const getAuto = (td) => td ? (td.querySelector('[data-automation="cell-value"]')?.textContent.trim() || td.textContent.trim()) : '';
        return [
            get(tds[1]),
            tds[2]?.querySelector('.search-keyword a')?.textContent.trim() || get(tds[2]),
            parseDisplayValue(tds[3]?.querySelector('[class*="TotalVisits"]')?.textContent.trim() || get(tds[3])),
            get(tds[4]), get(tds[5]), get(tds[6]),
            parseDisplayValue(getAuto(tds[7])), get(tds[8]),
            parseDisplayValue(get(tds[9])),
            parseDisplayValue(getAuto(tds[11])),
            parseDisplayValue(getAuto(tds[12])),
            parseDisplayValue(getAuto(tds[13])),
            get(tds[14]), get(tds[15]), get(tds[16]),
        ];
    }

    function extractCurrentPage_SimilarWeb() {
    

        // 尝试 React 表格
        const columns = document.querySelectorAll('.swReactTable-column');
        const dataColumns = [];
        for (let i = 0; i < columns.length; i++) {
            const cells = columns[i].querySelectorAll('.swReactTableCell');
            if (cells.length > 0) {
                dataColumns.push(Array.from(cells).map(c => c.textContent.trim()));
            }
        }

        if (dataColumns.length === 0) return [];

        const rowCount = dataColumns[0].length;
        const data = [];
        for (let r = 0; r < rowCount; r++) {
            const row = dataColumns.map(col => col[r] || '');
            data.push(row);
        }
        return data;
    }
 
 
    function getCurrentPage_SimilarWeb() {
        const footer = document.querySelector('.SWReactTableWrapperFooter-iWwFP');
        const text = footer?.textContent || '';
        const match = text.match(/(\d+)\s*out of/i);
        return match ? parseInt(match[1]) : 1;
    }

    function getTotalPages_SimilarWeb() {
        const footer = document.querySelector('.SWReactTableWrapperFooter-iWwFP');
        const text = footer?.textContent || '';
        const match = text.match(/out of\s*(\d+)/i);
        return match ? parseInt(match[1]) : 1;
    }

    function clickNextPage_SimilarWeb() {
        const nextBtn = document.querySelector('[data-automation-pagination-control="control-right"]:not([data-automation-pagination-control-disabled="true"])');
        if (nextBtn) {
            nextBtn.click();
            return true;
        }
        return false;
    }

    async function waitForPageLoad_SimilarWeb(oldFirstRow) {
        const start = Date.now();
        while (Date.now() - start < 15000) {
            await new Promise(resolve => setTimeout(resolve, 300));
            const columns = document.querySelectorAll('.swReactTable-column');
            if (columns.length === 0) continue;

            const firstRow = [];
            columns.forEach(col => {
                const cells = col.querySelectorAll('.swReactTableCell');
                if (cells.length > 0) {
                    firstRow.push(cells[0]?.textContent.trim() || '');
                }
            });

            const currentFirstRow = firstRow.join('|');
            if (currentFirstRow && currentFirstRow !== oldFirstRow) break;
        }
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    // ==================== Semrush 专用函数 ====================

    const EXPORT_CONFIGS = {
        similarweb: {
            extractData: extractCurrentPage_SimilarWeb,
            extractHeaders: extractHeaders_SimilarWeb,
            getCurrentPage: getCurrentPage_SimilarWeb,
            getTotalPages: getTotalPages_SimilarWeb,
            clickNext: clickNextPage_SimilarWeb,
            waitForLoad: waitForPageLoad_SimilarWeb,
            getFirstRow: () => {
                const columns = document.querySelectorAll('.swReactTable-column');
                const firstRow = [];
                columns.forEach(col => {
                    const cells = col.querySelectorAll('.swReactTableCell');
                    if (cells.length > 0) firstRow.push(cells[0]?.textContent.trim() || '');
                });
                return firstRow.join('|');
            },
            fileName: (count) => `${document.title}_${count}pages.xlsx`,
            sheetName: document.title
        },
        semrush: {
            extractData: () => {
                const result = getCurrentPageData_Semrush();
                return result ? result.rows : null;
            },
            extractHeaders: () => {
                const result = getCurrentPageData_Semrush();
                return result ? result.headers : null;
            },
            getCurrentPage: getCurrentPage_Semrush,
            getTotalPages: getTotalPages_Semrush,
            clickNext: clickNextPage_Semrush,
            waitForLoad: waitForPageLoad_Semrush,
            getFirstRow: () => {
                const table = document.querySelector('[data-ui-name="DataTable"]');
                const firstRow = table?.querySelector('[role="row"]:nth-child(2)');
                const cells = firstRow?.querySelectorAll('[role="cell"], [role="gridcell"]');
                return Array.from(cells || []).map(c => c.textContent.trim()).join('|');
            },
            fileName: (count) => `${document.title}_${count}pages.xlsx`,
            sheetName: document.title
        }
    };

    // ==================== Semrush 专用函数 ====================


    function getTotalPages_Semrush() {
        const pagination = document.querySelector('[data-ui-name="Pagination"]');
        if (!pagination) return 1;
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
        return pageButtons.length > 0 ? Math.max(...pageButtons) : 1;
    }

    function getCurrentDomain_Semrush() {
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

    function getCurrentPage_Semrush() {
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

    function getCurrentPageData_Semrush() {
        const table = document.querySelector('[data-ui-name="DataTable"],[role="table"]');
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

    function clickNextPage_Semrush() {
        const nextBtn = Array.from(document.querySelectorAll('[data-ui-name="Pagination"] button'))
            .find(btn => btn.textContent.includes('下一页') && !btn.disabled);
        if (nextBtn) {
            nextBtn.click();
            return true;
        }
        return false;
    }

    async function waitForPageLoad_Semrush(oldFirstRowData) {
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

    async function exportAllPages(config) {
        const button = document.getElementById('export-excel-btn');
        setButtonState(button, 'loading', {
            normalText: '导出Excel',
            loadingText: '准备中...',
            backgroundColor: BUTTON_COLORS.primary
        });

        await new Promise(resolve => setTimeout(resolve, 500));

        const headers = config.extractHeaders();
        if (!headers || headers.length === 0) {
            alert('无法提取表格列头');
            setButtonState(button, 'normal', { normalText: '导出Excel', backgroundColor: BUTTON_COLORS.primary });
            return;
        }

        const testData = config.extractData();
        if (!testData || testData.length === 0) {
            alert('当前页面没有可导出的数据');
            setButtonState(button, 'normal', { normalText: '导出Excel', backgroundColor: BUTTON_COLORS.primary });
            return;
        }

        const currentPage = config.getCurrentPage();
        const totalPages = config.getTotalPages();
        const remainingPages = totalPages - currentPage + 1;
        let pagesToExport = remainingPages;

        if (remainingPages > 20) {
            const input = prompt(`当前第 ${currentPage} 页，共 ${totalPages} 页，剩余 ${remainingPages} 页。\n请输入要导出的页数（1-${remainingPages}）：`, '20');
            if (input === null) {
                setButtonState(button, 'normal', { normalText: '导出Excel', backgroundColor: BUTTON_COLORS.primary });
                return;
            }
            const parsed = parseInt(input);
            if (!parsed || parsed < 1 || parsed > remainingPages) {
                alert(`请输入 1 到 ${remainingPages} 之间的整数`);
                setButtonState(button, 'normal', { normalText: '导出Excel', backgroundColor: BUTTON_COLORS.primary });
                return;
            }
            pagesToExport = parsed;
        }

        const endPage = currentPage + pagesToExport - 1;
        const allData = [];
        let pageCount = 0;
        const failedPages = [];

        try {
            for (let page = currentPage; page <= endPage; page++) {
                button.textContent = `导出中... ${page - currentPage + 1}/${pagesToExport}`;

                const pageData = config.extractData();
                if (!pageData || pageData.length === 0) {
                    failedPages.push(page);
                    break;
                }

                allData.push(...pageData);
                pageCount++;

                if (page >= endPage) break;

                const oldFirstRow = config.getFirstRow();
                if (!config.clickNext()) {
                    console.log(`第 ${page} 页：无法点击下一页按钮`);
                    break;
                }

                await config.waitForLoad(oldFirstRow);
            }

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet([headers, ...allData]);
            XLSX.utils.book_append_sheet(wb, ws, config.sheetName);
            XLSX.writeFile(wb, config.fileName(pageCount));

            button.textContent = failedPages.length > 0
                ? `导出完成(${pageCount}页，${failedPages.length}页失败)`
                : `导出完成(${pageCount}页)`;
            button.style.backgroundColor = BUTTON_COLORS.success;
        } catch (error) {
            button.textContent = '导出失败';
            button.style.backgroundColor = BUTTON_COLORS.error;
            console.error(error);
        }

        setTimeout(() => {
            setButtonState(button, 'normal', { normalText: '导出Excel', backgroundColor: BUTTON_COLORS.primary });
        }, 3000);
    }
    // ==================== 按钮创建 ====================

    // ==================== 按钮管理 ====================

    function setButtonState(button, state, config) {
        const states = {
            normal: { text: config.normalText, bg: config.backgroundColor, disabled: false },
            loading: { text: config.loadingText || '处理中...', bg: BUTTON_COLORS.loading, disabled: true },
            success: { text: config.successText || '完成', bg: BUTTON_COLORS.success, disabled: true },
            error: { text: config.errorText || '失败', bg: BUTTON_COLORS.error, disabled: true }
        };

        const s = states[state];
        if (s) {
            button.textContent = s.text;
            button.style.backgroundColor = s.bg;
            button.disabled = s.disabled;
            button.style.cursor = s.disabled ? 'not-allowed' : 'pointer';
        }
    }

    function createButton(config) {
        const button = document.createElement('button');
        button.id = config.id;
        button.textContent = config.text;
        button.style.cssText = `
            background-color: ${config.backgroundColor};
            color: white;
            border: 2px solid ${config.borderColor};
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            height: 32px;
            min-width: 100px;
            padding: 0 12px;
            transition: all 0.3s;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        `;

        button.addEventListener('mouseenter', () => {
            if (!button.disabled) {
                button.style.backgroundColor = config.hoverColor;
                button.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
            }
        });
        button.addEventListener('mouseleave', () => {
            if (!button.disabled) {
                button.style.backgroundColor = config.backgroundColor;
                button.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
            }
        });

        button.addEventListener('click', config.onClick);
        return button;
    }

    function createButtonContainer() {
        if (document.getElementById('button-container')) return;

        const container = document.createElement('div');
        container.id = 'button-container';
        container.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 9999;
            background: rgba(255, 255, 255, 0.95);
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            padding: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            display: flex;
            gap: 10px;
        `;

        const isSimilarWeb = window.location.hostname.includes('sim.3ue.co');

        const translateBtn = createButton({
            id: 'translate-btn',
            text: '关键字翻译',
            backgroundColor: BUTTON_COLORS.primary,
            borderColor: BUTTON_COLORS.primaryDark,
            hoverColor: BUTTON_COLORS.primaryLight,
            onClick: async () => {
                translateBtn.disabled = true;
                translateBtn.textContent = '翻译中...';
                translateBtn.style.backgroundColor = BUTTON_COLORS.loading;
                try {
                    await translateAllElements();
                    translateBtn.textContent = '翻译完成';
                    translateBtn.style.backgroundColor = BUTTON_COLORS.success;
                    setTimeout(() => {
                        translateBtn.textContent = '关键字翻译';
                        translateBtn.style.backgroundColor = BUTTON_COLORS.primary;
                        translateBtn.disabled = false;
                    }, 3000);
                } catch (error) {
                    console.error('翻译过程出错:', error);
                    translateBtn.textContent = '翻译失败';
                    translateBtn.style.backgroundColor = BUTTON_COLORS.error;
                    translateBtn.disabled = false;
                } 
            }
        });

        const exportBtn = createButton({
            id: 'export-excel-btn',
            text: '导出Excel',
            backgroundColor: BUTTON_COLORS.primary,
            borderColor: BUTTON_COLORS.primaryDark,
            hoverColor: BUTTON_COLORS.primaryLight,
            onClick: () => {
                const config = isSimilarWeb ? EXPORT_CONFIGS.similarweb : EXPORT_CONFIGS.semrush;
                exportAllPages(config);
            }
        });

        container.appendChild(translateBtn);
        container.appendChild(exportBtn);
        document.body.appendChild(container);
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

     

    //调整 SimilarWeb 页面的宽度
      function adjustWidth() {
        if (document.getElementById('sw-width-override')) return;
        const style = document.createElement('style');
        style.id = 'sw-width-override';
        style.textContent = `.sw-layout-page, .sw-layout-page-max-width { max-width: 2000px !important; margin: 0 auto; padding: 0 43px 50px; }`;
        document.head.appendChild(style);
    }

    // ==================== 初始化 ====================

    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                createButtonContainer();
        
            });
        } else {
            createButtonContainer();
 
        }
 
        const observer = new MutationObserver(() => {
            createButtonContainer();  
        });
        observer.observe(document.body, { childList: true, subtree: true });

        adjustWidth();
    }

    init();

    window.TranslatePlugin = {
        translate: translateAllElements,
        batchTranslate: batchTranslate,
        config: TRANSLATE_CONFIG
    };

})();
