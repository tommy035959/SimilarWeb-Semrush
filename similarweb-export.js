// ==UserScript==
// @name         SimilarWeb 关键词导出工具
// @namespace    http://tampermonkey.net/
// @version      2026-03-19
// @description  导出 SimilarWeb 关键词数据为 Excel（支持控制台直接运行）
// @author       You
// @match        https://sim.3ue.co/
// @require      https://unpkg.com/xlsx/dist/xlsx.full.min.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    if (window.XLSX) { init(); return; }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/xlsx/dist/xlsx.full.min.js';
    script.onload = init;
    script.onerror = () => alert('SheetJS 加载失败，请检查网络');
    document.head.appendChild(script);

    function init() {
        const HEADERS = ['行号', '关键词', '点击量', 'KD变动', 'KD', '意图', '28天流量', '流量变化', '平均体量', 'CPC', '零点击', '排位', '排位变动', '热门网址', '#URL'];

        let isExporting = false;

        function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

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

        function extractRowData(tr) {
            const tds = tr.querySelectorAll('td');
            if (tds.length < 17) return null;

            const get = (td) => td ? td.textContent.trim() : '';
            const getAuto = (td) => td ? (td.querySelector('[data-automation="cell-value"]')?.textContent.trim() || td.textContent.trim()) : '';

            return [
                get(tds[1]),                                                                          // 行号
                tds[2]?.querySelector('.search-keyword a')?.textContent.trim() || get(tds[2]),       // 关键词
                parseDisplayValue(tds[3]?.querySelector('[class*="TotalVisits"]')?.textContent.trim() || get(tds[3])),  // 点击量
                get(tds[4]),                                                                                          // KD变动
                get(tds[5]),                                                                                          // KD
                get(tds[6]),                                                                                          // 意图
                parseDisplayValue(getAuto(tds[7])),                                                                   // 28天流量
                get(tds[8]),                                                                                          // 流量变化
                parseDisplayValue(get(tds[9])),                                                                       // 平均体量
                parseDisplayValue(getAuto(tds[11])),                                                                  // CPC
                parseDisplayValue(getAuto(tds[12])),                                                                  // 零点击
                parseDisplayValue(getAuto(tds[13])),                                                                  // 排位
                get(tds[14]),                                                                         // 排位变动
                get(tds[15]),                                                                         // 热门网址
                get(tds[16]),                                                                         // #URL
            ];
        }

        function extractCurrentPage() {
            const rows = document.querySelectorAll('table tbody tr');
            const data = [];
            for (let i = 1; i < rows.length; i++) {
                const row = extractRowData(rows[i]);
                if (row) data.push(row);
            }
            return data;
        }

        function getTotalPages() {
            const input = document.querySelector('.ant-pagination-simple-pager input');
            if (!input) return null;
            const match = input.placeholder?.match(/\/(\d+)/) || input.value?.match(/\/(\d+)/);
            if (match) return parseInt(match[1]);
            const pager = input.closest('.ant-pagination-simple-pager');
            if (pager) {
                const text = pager.textContent;
                const m = text.match(/\/\s*(\d+)/);
                if (m) return parseInt(m[1]);
            }
            return null;
        }

        async function goToPage(pageNum) {
            const input = document.querySelector('.ant-pagination-simple-pager input');
            if (!input) return;
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(input, String(pageNum));
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
        }

        async function waitForPageLoad(oldFirstKeyword) {
            const start = Date.now();
            while (Date.now() - start < 15000) {
                await sleep(300);
                const rows = document.querySelectorAll('table tbody tr');
                if (rows.length < 2) continue;
                const firstKw = rows[1]?.querySelector('td:nth-child(3)')?.textContent.trim();
                if (firstKw && firstKw !== oldFirstKeyword) break;
            }
            await sleep(200);
        }

        async function exportAll(btn) {
            if (isExporting) {
                isExporting = false;
                btn.textContent = '已取消';
                btn.style.backgroundColor = '#999';
                setTimeout(() => {
                    btn.textContent = '导出 Excel';
                    btn.style.backgroundColor = '#1890ff';
                    btn.disabled = false;
                }, 2000);
                return;
            }

            isExporting = true;
            btn.textContent = '准备中...';
            btn.style.backgroundColor = '#999';

            await sleep(500);

            const totalPages = getTotalPages();
            if (!totalPages) {
                alert('无法读取总页数，请确认分页器已加载');
                isExporting = false;
                btn.textContent = '导出 Excel';
                btn.style.backgroundColor = '#1890ff';
                btn.disabled = false;
                return;
            }

            let startPage = 1;
            let endPage = totalPages;

            if (totalPages > 10) {
                const startInput = prompt(`共 ${totalPages} 页，请输入起始页（1-${totalPages}）：`, '1');
                if (startInput === null) {
                    isExporting = false;
                    btn.textContent = '导出 Excel';
                    btn.style.backgroundColor = '#1890ff';
                    btn.disabled = false;
                    return;
                }
                const parsedStart = parseInt(startInput);
                if (!parsedStart || parsedStart < 1 || parsedStart > totalPages) {
                    alert('起始页无效，请输入 1 到 ' + totalPages + ' 之间的整数');
                    isExporting = false;
                    btn.textContent = '导出 Excel';
                    btn.style.backgroundColor = '#1890ff';
                    btn.disabled = false;
                    return;
                }
                startPage = parsedStart;

                const endInput = prompt(`请输入结束页（${startPage}-${totalPages}）：`, String(totalPages));
                if (endInput === null) {
                    isExporting = false;
                    btn.textContent = '导出 Excel';
                    btn.style.backgroundColor = '#1890ff';
                    btn.disabled = false;
                    return;
                }
                const parsedEnd = parseInt(endInput);
                if (!parsedEnd || parsedEnd < startPage || parsedEnd > totalPages) {
                    alert('结束页无效，请输入 ' + startPage + ' 到 ' + totalPages + ' 之间的整数');
                    isExporting = false;
                    btn.textContent = '导出 Excel';
                    btn.style.backgroundColor = '#1890ff';
                    btn.disabled = false;
                    return;
                }
                endPage = parsedEnd;
            }

            const wb = XLSX.utils.book_new();
            const ws = {};
            XLSX.utils.sheet_add_aoa(ws, [HEADERS], { origin: 'A1' });

            let currentRow = 1;
            let rowBuffer = [];
            const failedPages = [];

            function flushBuffer() {
                if (rowBuffer.length === 0) return;
                XLSX.utils.sheet_add_aoa(ws, rowBuffer, { origin: { r: currentRow, c: 0 } });
                currentRow += rowBuffer.length;
                rowBuffer = [];
            }

            if (startPage > 1) {
                const rows = document.querySelectorAll('table tbody tr');
                const oldFirstKw = rows[1]?.querySelector('td:nth-child(3)')?.textContent.trim() || '';
                await goToPage(startPage);
                await waitForPageLoad(oldFirstKw);
            }

            for (let page = startPage; page <= endPage; page++) {
                if (!isExporting) break;

                btn.textContent = `导出中... ${page}/${endPage}（点击取消）`;

                if (page > startPage) {
                    const rows = document.querySelectorAll('table tbody tr');
                    const oldFirstKw = rows[1]?.querySelector('td:nth-child(3)')?.textContent.trim() || '';
                    await goToPage(page);
                    await waitForPageLoad(oldFirstKw);

                    const newRows = document.querySelectorAll('table tbody tr');
                    const newFirstKw = newRows[1]?.querySelector('td:nth-child(3)')?.textContent.trim() || '';
                    if (!newFirstKw || newFirstKw === oldFirstKw) {
                        await sleep(2000);
                        await goToPage(page);
                        await waitForPageLoad(oldFirstKw);
                        const retryRows = document.querySelectorAll('table tbody tr');
                        const retryKw = retryRows[1]?.querySelector('td:nth-child(3)')?.textContent.trim() || '';
                        if (!retryKw || retryKw === oldFirstKw) {
                            failedPages.push(page);
                            continue;
                        }
                    }
                }

                const pageData = extractCurrentPage();
                rowBuffer.push(...pageData);

                if (rowBuffer.length >= 5000) {
                    flushBuffer();
                }
            }

            flushBuffer();

            ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: currentRow, c: HEADERS.length - 1 } });
            ws['!cols'] = [8, 30, 12, 10, 8, 10, 12, 12, 12, 10, 10, 10, 12, 30, 10].map(w => ({ wch: w }));

            XLSX.utils.book_append_sheet(wb, ws, '关键词');
            XLSX.writeFile(wb, 'keywords.xlsx');

            if (failedPages.length > 0) {
                console.warn('以下页面导出失败:', failedPages);
            }

            isExporting = false;
            btn.textContent = failedPages.length > 0 ? `导出完成（${failedPages.length}页失败）` : '导出完成';
            btn.style.backgroundColor = '#52c41a';
            setTimeout(() => {
                btn.textContent = '导出 Excel';
                btn.style.backgroundColor = '#1890ff';
                btn.disabled = false;
            }, 3000);
        }

        function createExportButton() {
            setTimeout(createExportButton, 3000);

            const container = document.querySelector('.FiltersContainer');
            if (!container) return;
            if (document.getElementById('export-excel-btn')) return;

            const btn = document.createElement('button');
            btn.id = 'export-excel-btn';
            btn.textContent = '导出 Excel';
            btn.style.cssText = `
                padding: 8px 16px;
                background-color: #1890ff;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                margin: 5px;
                transition: background-color 0.3s;
            `;

            btn.addEventListener('mouseenter', () => {
                if (!isExporting) btn.style.backgroundColor = '#40a9ff';
            });
            btn.addEventListener('mouseleave', () => {
                if (!isExporting) btn.style.backgroundColor = '#1890ff';
            });

            btn.addEventListener('click', () => {
                btn.disabled = true;
                exportAll(btn).catch(err => {
                    console.error('导出失败:', err);
                    isExporting = false;
                    btn.textContent = '导出失败，点击重试';
                    btn.style.backgroundColor = '#f5222d';
                    btn.disabled = false;
                });
            });

            container.prepend(btn);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', createExportButton);
        } else {
            createExportButton();
        }
    }
})();
