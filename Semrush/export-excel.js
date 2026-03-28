// ==UserScript==
// @name         SEO数据导出Excel
// @namespace    http://tampermonkey.net/
// @version      2026-03-23
// @description  导出DataTable数据为Excel
// @author       Tommy
// @match        https://sem.3ue.co/analytics/organic/positions/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=3ue.co
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /**
     * 解析显示值，将 K/M 后缀转换为实际数字
     * @param {string} str - 原始字符串
     * @returns {number|string} 解析后的数值或原字符串
     */
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

    /**
     * 获取总页数
     */
    function getTotalPages() {
        const pagination = document.querySelector('[data-ui-name="Pagination"]');
        if (!pagination) return null;

        const pageText = pagination.textContent;

        // 匹配 "共 X 页" 格式
        const match1 = pageText.match(/共\s*(\d+)\s*页/);
        if (match1) return parseInt(match1[1]);

        // 匹配 "/X" 格式（如 "/551,365"）
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

    /**
     * 获取当前分析的域名
     */
    function getCurrentDomain() {
        const input = document.querySelector('input[value*="."]');
        if (input && input.value) {
            return input.value.trim();
        }

        const urlParams = new URLSearchParams(window.location.search);
        const domain = urlParams.get('q');
        if (domain) return domain;

        return 'export';
    }

    /**
     * 格式化日期为 yyyy-MM-dd
     */
    function formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * 获取当前页码
     */
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

    /**
     * 获取当前页数据
     */
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

    /**
     * 点击下一页按钮
     */
    function clickNextPage() {
        const nextBtn = Array.from(document.querySelectorAll('[data-ui-name="Pagination"] button'))
            .find(btn => btn.textContent.includes('下一页') && !btn.disabled);
        if (nextBtn) {
            nextBtn.click();
            return true;
        }
        return false;
    }

    /**
     * 等待页面加载完成（通过比较第一行数据）
     */
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

            if (currentRowData &&
                currentRowData !== oldFirstRowData &&
                currentRowData.replace(/\|/g, '').length > 0) {
                break;
            }
        }
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    /**
     * 导出多页数据
     */
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
                console.log(`第 ${page} 页加载完成`);

                const newFirstRow = table?.querySelector('[role="row"]:nth-child(2)');
                const newCells = newFirstRow?.querySelectorAll('[role="cell"], [role="gridcell"]');
                const newFirstRowData = newCells ? Array.from(newCells).map(cell => cell.textContent.trim()).join('|') : '';
                console.log(`第 ${page} 页验证: 旧=${oldFirstRowData.substring(0, 50)}, 新=${newFirstRowData.substring(0, 50)}, 相同=${newFirstRowData === oldFirstRowData}`);

                if (!newFirstRowData || newFirstRowData === oldFirstRowData) {
                    console.warn(`第 ${page} 页数据未变化，但继续执行`);
                }
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

            if (failedPages.length > 0) {
                console.warn('以下页面导出失败:', failedPages);
            }

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

    /**
     * 创建导出按钮
     */
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

    /**
     * 初始化
     */
    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', createExportButton);
        } else {
            createExportButton();
        }

        const observer = new MutationObserver(() => createExportButton());
        observer.observe(document.body, { childList: true, subtree: true });
    }

    init();

})();
