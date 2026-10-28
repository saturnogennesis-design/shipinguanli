# 真实旧版 Office 测试样本

两个文件均使用人工合成的测试内容，不含正式业务数据或凭据。

- daily-word.doc：由 python-docx 生成中文标题、正文和两列表格，再用 LibreOffice 的 MS Word 97 导出过滤器转换。
- daily-excel.xls：由 openpyxl 生成两个中文工作表、数量、日期和 SUM 公式，再用 LibreOffice 的 MS Excel 97 导出过滤器转换。

二者文件头均为 d0cf11e0a1b11ae1，即真实旧版 OLE 二进制容器。运行 tests/office-convert.real.test.mjs 时需要安装 LibreOffice 与 pdftotext，并通过 ORBIT_OFFICE_EXECUTABLE 指定命令。
