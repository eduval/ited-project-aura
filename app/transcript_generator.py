import os
import re
from docx import Document
from openpyxl import load_workbook

def generate_transcripts(input_dir, transcripts_dir, word_output_dir, template_docx):
    os.makedirs(word_output_dir, exist_ok=True)

    # === LOAD RAW STUDENT DATA ===
    student_info_map = {}

    for fname in os.listdir(input_dir):
        if not fname.lower().endswith(".xlsx"):
            continue

        wb = load_workbook(os.path.join(input_dir, fname))
        if "Raw" not in wb.sheetnames:
            continue

        raw = wb["Raw"]
        headers = [str(cell.value).strip() if cell.value else "" for cell in raw[1]]
        for row in raw.iter_rows(min_row=2, values_only=True):
            student = dict(zip(headers, row))
            student_no = str(student.get("Student No")).strip()
            if student_no:
                student_info_map[student_no] = student

    # === THIS PART WILL CREATE THE TRANSCRIPT DOCX PER STUDENT ===
    for fname in os.listdir(transcripts_dir):
        if not fname.endswith(".xlsx"):
            continue

        wb = load_workbook(os.path.join(transcripts_dir, fname))
        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            student_no = sheet_name

            if student_no not in student_info_map:
                print(f"Missing student metadata for {student_no}")
                continue

            data = student_info_map[student_no]

            # Extract and clean metadata
            full_name = f"{data.get('First Name', '')} {data.get('Last Name', '')}".strip()
            program = str(data.get("Program", "Unknown"))
            start_date = str(data.get("Program start date", "Unknown"))
            dob = str(data.get("DOB", "Unknown"))
            end_date = str(data.get("Program End Date", "N/A"))

            # Load and modify Word template
            doc = Document(template_docx)
            label_map = {
                "Program:": program,
                "Student Name:": full_name,
                "Student Number:": student_no,
                "DOB:": dob,
                "Program Start Date:": start_date,
                "Program End Date:": end_date,
            }

            for para in doc.paragraphs:
                for label, value in label_map.items():
                    if label in para.text:
                        for run in para.runs:
                            if label in run.text:
                                run.text = f"{label} {value}"

            # Insert transcript table
            insert_after = None
            address_str = "Address: 101 Smithe St – Vancouver, British Columbia, Canada, V6B 4Z8, Canada"
            for idx, para in enumerate(doc.paragraphs):
                if address_str in para.text:
                    insert_after = idx
                    break

            table = doc.add_table(rows=1, cols=6)
            table.style = "Style2"
            headers = ["Course Code","Course Name","Course Start Date","Course End Date","Attendance  (%)","Grade  (%)"]
            for i in range(6):
                table.rows[0].cells[i].text = headers[i]

            for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
                if not row[0] and i < ws.max_row:
                    continue
                cells = table.add_row().cells
                for j in range(min(6, len(row))):
                    cells[j].text = str(row[j]) if row[j] is not None else ""

            if insert_after is not None:
                doc._body._element.remove(table._element)
                doc.paragraphs[insert_after]._element.addnext(table._element)
            else:
                print(f"Address line not found in Word template for {student_no}")
                doc.add_paragraph("Transcript Table (position unknown):")
                doc._body._element.append(table._element)

            clean_student_no = student_no.replace("CT", "")
            output_path = os.path.join(word_output_dir, f"iTED-2025-{clean_student_no}.docx")
            doc.save(output_path)
            print(f"Saved: {output_path}")

    print("All transcripts generated :)!")
