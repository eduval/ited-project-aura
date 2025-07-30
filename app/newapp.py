from flask import Flask, request, render_template
from openpyxl import load_workbook
from numbers import Number
import os
import tempfile

app = Flask(__name__)

@app.route("/", methods=["GET", "POST"])
def index():
    if request.method == "POST":
        file = request.files["file"]

        if file and file.filename.endswith(".xlsx"):
            temp_dir = tempfile.mkdtemp()
            file_path = os.path.join(temp_dir, file.filename)
            file.save(file_path)

            try:
                # This checks if the uploaded file is valid
                issues = validate_excel(file_path)
                if issues:
                    # Return a clear message if invalid file, so the user can replace it 
                    html = "<h2>This file is not valid, please try with another one.</h2>"
                    html += "<h3>Validation Errors Found:</h3>"
                    for sheet, problems in issues.items():
                        html += f"<h4>Sheet: {sheet}</h4><ul>"
                        for p in problems:
                            html += f"<li>{p}</li>"
                        html += "</ul>"
                    return html

                sheet_summary = process_excel(file_path)
                html_output = "<h2>Uploaded Excel File Processed</h2>"
                for sheet, rows in sheet_summary.items():
                    html_output += f"<h3>Sheet: {sheet}</h3><pre>"
                    for row in rows[:10]:  # Show only first 10 rows
                        html_output += str(row) + "\n"
                    html_output += "</pre>"
                return html_output

            except Exception as e:
                return f"<h3>Error while processing Excel file:</h3><pre>{e}</pre>"

        return "<h3>Invalid file type. Please upload a .xlsx file.</h3>"

    return render_template("Page.html")

#  Function to process Excel data
def process_excel(input_file):
    wb = load_workbook(input_file, data_only=True)
    sheet_data = {}
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        rows = [list(row) for row in ws.iter_rows(values_only=True)]
        sheet_data[sheet_name] = rows
    return sheet_data

#  Function to classify value type
def get_simple_type(value):
    if isinstance(value, str):
        return "str"
    elif isinstance(value, Number):
        return "number"
    elif value is None:
        return "none"
    else:
        return "other"

#  Function to validate Excel content
def validate_excel(file_path):
    wb = load_workbook(file_path, data_only=True)
    issues = {}

    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        problems = []

        headers = [cell.value for cell in ws[1]]

        # 1. Unnamed columns
        unnamed = [i+1 for i, h in enumerate(headers) if h is None or str(h).strip() == ""]
        if unnamed:
            problems.append(f"Unnamed columns at positions: {unnamed}")

        # 2. Repeated column names
        header_set = set()
        repeated = []
        for h in headers:
            if h in header_set and h not in repeated and h is not None:
                repeated.append(h)
            header_set.add(h)
        if repeated:
            problems.append(f"Repeated column names: {repeated}")

        # 3. Type mismatches
        type_mismatches = {}
        for col_idx, header in enumerate(headers):
            if header is None:
                continue
            expected_type = None
            for row in ws.iter_rows(min_row=2, min_col=col_idx+1, max_col=col_idx+1, values_only=True):
                val = row[0]
                if val is None:
                    continue
                val_type = get_simple_type(val)
                if expected_type is None:
                    expected_type = val_type
                elif val_type != expected_type:
                    type_mismatches.setdefault(header, []).append(val)
        if type_mismatches:
            msg = "Type mismatches found in columns:<br>"
            for k, v in type_mismatches.items():
                msg += f" - {k}: examples {v[:3]}<br>"
            problems.append(msg.strip())

        # 4. Empty columns
        empty_columns = []
        for col_idx, header in enumerate(headers):
            if header is None:
                continue
            values = [
                row[0] for row in ws.iter_rows(min_row=2, min_col=col_idx+1, max_col=col_idx+1, values_only=True)
                if row[0] is not None and str(row[0]).strip() != ""
            ]
            if not values:
                empty_columns.append(header)
        if empty_columns:
            problems.append(f"Empty columns with no values: {empty_columns}")

        # 5. Empty cells
        empty_cells = []
        for row in ws.iter_rows(min_row=2, values_only=True):
            for col_idx, cell in enumerate(row):
                if cell is None or str(cell).strip() == "":
                    col_letter = ws.cell(row=1, column=col_idx+1).value or f"Col{col_idx+1}"
                    empty_cells.append(f"{col_letter} (row {row[0] if row else '?'} row index unknown)")

        if empty_cells:
            problems.append(f"Empty cells found in sheet (up to 10 shown): {empty_cells[:10]}")

        if problems:
            issues[sheet_name] = problems

    return issues

if __name__ == "__main__":
    app.run(debug=True, port=5000)
