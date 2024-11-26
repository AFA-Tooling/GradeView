from flask import Flask, request, render_template
from werkzeug.utils import secure_filename
from jsonschema import validate, ValidationError
import json
import os
# import course_parser as parser
import parser

"""
Dream Team GUI
@Version: DEV
@Copy Right:

    - Parser:
        (C) 2022 University of California, Berkeley - ACE Lab

    - Web GUI - Modifications:
        Copyright 2022 University of California, Berkeley - ACE Lab

        Permission to use, copy, modify, and/or distribute this software for any purpose
        with or without fee is hereby granted, provided that the above copyright notice
        and this permission notice appear in all copies.

        THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
        REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
        FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
        INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
        OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
        TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
        THIS SOFTWARE.

    - Web GUI - Interactive d3.js tree diagram
        Copyright 2022 github.com/d3noob

        Permission is hereby granted, free of charge, to any person obtaining a copy of
        this software and associated documentation files (the "Software"), to deal in the
        Software without restriction, including without limitation the rights to use, copy,
        modify, merge, publish, distribute, sublicense, and/or sell copies of the Software,
        and to permit persons to whom the Software is furnished to do so, subject to the
        following conditions:

        The above copyright notice and this permission notice shall be included in all copies
        or substantial portions of the Software.

        THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
        INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
        PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
        FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
        OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
        DEALINGS IN THE SOFTWARE.

    - Web GUI - D3.js Framework
        Copyright 2010-2021 Mike Bostock

        Permission to use, copy, modify, and/or distribute this software for any purpose
        with or without fee is hereby granted, provided that the above copyright notice
        and this permission notice appear in all copies.

        THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
        REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
        FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
        INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
        OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
        TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
        THIS SOFTWARE.
"""

app = Flask(__name__)

@app.route('/', methods=["GET"])
def index():
    school_name = request.args.get("school", "Berkeley")
    course_name = request.args.get("class", "CS10")
    student_mastery = request.args.get("student_mastery", "000000")
    class_mastery = request.args.get("class_mastery", "")
    use_url_class_mastery = True if class_mastery != "" else False
    if not student_mastery.isdigit():
        return "URL parameter student_mastery is invalid", 400
    if use_url_class_mastery and not class_mastery.isdigit():
        return "URL parameter class_mastery is invalid", 400
    parser.generate_map(school_name=secure_filename(school_name), course_name=secure_filename(course_name), render=True)
    try:
        with open("data/{}_{}.json".format(secure_filename(school_name), secure_filename(course_name))) as data_file:
            course_data = json.load(data_file)
    except FileNotFoundError:
        return "Class not found", 400
    start_date = course_data["start date"]
    course_term = course_data["term"]
    class_levels = course_data["class levels"]
    student_levels = course_data["student levels"]
    course_node_count = course_data["count"]
    course_nodes = course_data["nodes"]
    parser.assign_node_levels(course_nodes, len(student_levels), len(class_levels), student_mastery, class_mastery)
    return render_template("web_ui.html",
                           start_date=start_date,
                           course_name=course_name,
                           course_term=course_term,
                           class_levels=class_levels,
                           student_levels=student_levels,
                           use_url_class_mastery=use_url_class_mastery,
                           course_node_count=course_node_count,
                           course_data=course_nodes)


@app.route('/parse', methods=["POST"])
def parse():
    school_name = request.args.get("school_name", "Berkeley")
    course_name = request.form.get("course_name", "CS10")
    parser.generate_map(school_name=secure_filename(school_name), course_name=secure_filename(course_name), render=False)
    try:
        with open("data/{}_{}.json".format(secure_filename(school_name), secure_filename(course_name))) as data_file:
            course_data = json.load(data_file)
    except FileNotFoundError:
        return "Class not found", 400
    return course_data

@app.route('/update_concept_map', methods=['POST'])
def update_concept_map():
    try:

        # Load existing course data
        school_name = request.args.get("school", "Berkeley")
        course_name = request.args.get("class", "CS10")

        parser.generate_map(school_name=secure_filename(school_name), course_name=secure_filename(course_name), render=True)
        try:
            with open("data/{}_{}.json".format(secure_filename(school_name), secure_filename(course_name))) as data_file:
                course_data = json.load(data_file)
        except FileNotFoundError:
            return "Class not found", 400
        
        # Parse JSON input and validates it 
        input_data = request.get_json()
        schema = {
            "type": "object",
            "additionalProperties": {
                "type": "string"
            }
        }

        validate(instance=input_data, schema=schema)
        # if not input_data:
        #     return 'Invalid JSON input', 400
        
        course_nodes = course_data["nodes"]
        class_levels = course_data["class levels"]
        student_levels = course_data["student levels"]
        student_mastery = request.args.get("student_mastery", "000000")
        class_mastery = request.args.get("class_mastery", "")
        #Create the "Student_level" and "Class_level" variables and set them to 0
        parser.assign_node_levels(course_nodes, len(student_levels), len(class_levels), "0", "")

        # Update node mastery levels
        parser.update_node_mastery(course_data['nodes'], input_data)

        # Calculate class levels by averaging student levels
        parser.calculate_class_level(course_data['nodes'])
    
        # Render updated HTML
        html_content = render_template("web_ui.html",
                                       start_date=course_data["start date"],
                                       course_name=course_name,
                                       course_term=course_data["term"],
                                       class_levels=course_data["class levels"],
                                       student_levels=course_data["student levels"],
                                       use_url_class_mastery=False,
                                       course_node_count=course_data["count"],
                                       course_data=course_data["nodes"],
                                       student_mastery="",
                                       )

        return html_content

    except Exception as e:
        # Handle exceptions
        return str(e), 500

if __name__ == '__main__':
    app.run()
