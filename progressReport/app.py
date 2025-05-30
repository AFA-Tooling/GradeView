from flask import Flask, request, render_template
from werkzeug.utils import secure_filename
import json
import os
import parser
import jsonschema
from deprecated import deprecated

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

with open("meta/defaults.json", "r") as defaults_file:
    default = json.load(defaults_file)

DEFAULT_SCHOOL = default["school"]
DEFAULT_CLASS = default["class"]

"""
Validates the fields of the mastery learning post request
"""
def validate_mastery_learning_post_request(request_as_json):
    schema = {
        "type": "object",
        # Matches mastery fields (fields other than "school" and "class"
        "properties": {
            # These fields are optional.
            "school": {"type": "string"},
            "class": {"type": "string"},
        },
        "additionalProperties": {
            "type": "object",
            "properties": {
                "student_mastery": {"type": "integer"},
                "class_mastery": {"type": "integer"}
            },
            "additionalProperties": False
        },
    }

    # Intentionally not handling the error an improper format may produce for now.
    jsonschema.validate(instance=request_as_json, schema=schema)

"""
This method is deprecated.
"""
@deprecated(reason="Query parameters are no longer used.")
@app.route('/', methods=["GET"])
def index():
    print("In index")
    def assign_node_levels(node, student_levels_count, class_levels_count):
        nonlocal student_mastery, class_mastery
        if not node["children"]:
            if student_mastery:
                node["student_level"] = int(student_mastery[0]) if int(student_mastery[0]) < student_levels_count \
                    else student_levels_count - 1
            else:
                node["student_level"] = 0
            if class_mastery:
                node["class_level"] = int(class_mastery[0]) if int(class_mastery[0]) < class_levels_count \
                    else class_levels_count - 1
            else:
                node["class_level"] = 0
            student_mastery = student_mastery[1:] if len(student_mastery) > 1 else ""
            class_mastery = class_mastery[1:] if len(class_mastery) > 1 else ""
        else:
            children_student_levels = []
            children_class_levels = []
            for child in node["children"]:
                student_level, class_level = assign_node_levels(child, student_levels_count, class_levels_count)
                children_student_levels.append(student_level)
                children_class_levels.append(class_level)
            node["student_level"] = sum(children_student_levels) // len(children_student_levels)
            node["class_level"] = sum(children_class_levels) // len(children_class_levels)
        return node["student_level"], node["class_level"]

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
        return "Class not found", 404
    start_date = course_data["start date"]
    course_term = course_data["term"]
    class_levels = course_data["class levels"]
    student_levels = course_data["student levels"]
    course_node_count = course_data["count"]
    course_nodes = course_data["nodes"]
    assign_node_levels(course_nodes, len(student_levels), len(class_levels))
    return render_template("web_ui.html",
                           start_date=start_date,
                           course_name=course_name,
                           course_term=course_term,
                           class_levels=class_levels,
                           student_levels=student_levels,
                           use_url_class_mastery=use_url_class_mastery,
                           course_node_count=course_node_count,
                           course_data=course_nodes)


@app.route('/', methods=["POST"])
def generate_cm_from_post_parameters():
    print("In generate_cm_from_post_parameters")
    request_as_json = request.get_json()
    print("Request", request)
    validate_mastery_learning_post_request(request_as_json)
    school_name = request_as_json.get("school", DEFAULT_SCHOOL)
    course_name = request_as_json.get("class", DEFAULT_CLASS)
    def assign_node_levels(node):
        if not node["children"]:
            node["student_level"] = request_as_json.get(node["name"], {}).get("student_mastery", 0)
            node["class_level"] = request_as_json.get(node["name"], {}).get("class_mastery", 0)
        else:
            children_student_levels = []
            children_class_levels = []
            for child in node["children"]:
                student_level, class_level = assign_node_levels(child)
                children_student_levels.append(student_level)
                children_class_levels.append(class_level)
            node["student_level"] = sum(children_student_levels) // len(children_student_levels)
            node["class_level"] = sum(children_class_levels) // len(children_class_levels)
        return node["student_level"], node["class_level"]

    parser.generate_map(school_name=secure_filename(school_name), course_name=secure_filename(course_name), render=True)
    try:
        with open("data/{}_{}.json".format(secure_filename(school_name), secure_filename(course_name))) as data_file:
            course_data = json.load(data_file)
    except FileNotFoundError:
        return "Class not found", 404
    start_date = course_data["start date"]
    course_term = course_data["term"]
    class_levels = course_data["class levels"]
    student_levels = course_data["student levels"]
    course_node_count = course_data["count"]
    course_nodes = course_data["nodes"]
    assign_node_levels(course_nodes)
    return render_template("web_ui.html",
                           start_date=start_date,
                           course_name=course_name,
                           course_term=course_term,
                           class_levels=class_levels,
                           student_levels=student_levels,
                           use_url_class_mastery=False,
                           course_node_count=course_node_count,
                           course_data=course_nodes)


@app.route('/parse', methods=["POST"])
def parse():
    school_name = request.args.get("school_name", DEFAULT_SCHOOL)
    course_name = request.form.get("course_name", DEFAULT_CLASS)
    parser.generate_map(school_name=secure_filename(school_name), course_name=secure_filename(course_name), render=False)
    try:
        with open("data/{}_{}.json".format(secure_filename(school_name), secure_filename(course_name))) as data_file:
            course_data = json.load(data_file)
    except FileNotFoundError:
        return "Class not found", 404
    return course_data

if __name__ == '__main__':
    app.run()
