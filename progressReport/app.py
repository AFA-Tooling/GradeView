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
    print("In GET route (index)")
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
    
    # Build dynamic tree structure from mastery data
    def build_dynamic_tree(mastery_data):
        """Build tree structure dynamically from mastery data"""
        root = {
            "id": 1,
            "name": course_name,
            "parent": "null",
            "children": [],
            "data": {
                "week": 0
            }
        }

        # Define the expected categories and their concepts based on the actual data structure
        category_mapping = {
            "Quest": ["Abstraction", "Number Representation", "Iteration", "Domain and Range", "Booleans", "Functions", "HOFs I"],
            "Midterm": ["Algorithms", "Computers and Education", "Testing + 2048 + Mutable/Immutable", "Saving the World with Computing", "Debugging", "Scope", "Iteration and Randomness", "Recursion Tracing", "Algorithmic Complexity", "HOFs II", "Fractal"],
            "Postterm": ["Python Advanced", "Programming Paradigms", "HCI", "Generative AI", "Ethics in AI", "Generic Base Conversion", "Concurrency", "HOFs III", "Coding Snap! Recursive Reporter and HOF", "Coding Python Data Structures"],
            "Projects": ["Project 1: Wordle™-lite", "Project 2: Spelling Bee", "Project 3: 2048"]
        }

        # Build tree structure
        node_id = 2
        for category, expected_concepts in category_mapping.items():
            category_node = {
                "id": node_id,
                "name": category,
                "parent": "null",  # Changed from course_name to "null"
                "children": [],
                "data": {
                    "week": 0  # Added data property for category nodes
                }
            }
            node_id += 1

            for concept_name in expected_concepts:
                # Find mastery data for this concept
                mastery_info = mastery_data.get(concept_name, {"student_mastery": 0, "class_mastery": 0})

                concept_node = {
                    "id": node_id,
                    "name": concept_name,
                    "parent": category,
                    "children": [],
                    "data": {
                        "week": 0  # Default week
                    }
                }
                node_id += 1
                category_node["children"].append(concept_node)

            root["children"].append(category_node)

        return root, node_id - 1

    def assign_node_levels(node):
        if not node["children"]:
            # For leaf nodes, get mastery from the concept name
            concept_name = node["name"]
            # Try to find matching mastery data
            mastery_data = None
            for key, value in request_as_json.items():
                if concept_name in key or key in concept_name:
                    mastery_data = value
                    break

            if mastery_data:
                node["student_level"] = mastery_data.get("student_mastery", 0)
                node["class_level"] = mastery_data.get("class_mastery", 0)
            else:
                node["student_level"] = 0
                node["class_level"] = 0
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

    # Build dynamic tree instead of using static parser
    print("About to build dynamic tree with data:", list(request_as_json.keys())[:5])
    course_nodes, course_node_count = build_dynamic_tree(request_as_json)
    print("Dynamic tree built with", course_node_count, "nodes and", len(course_nodes["children"]), "categories")

    # Use default values for other fields
    start_date = "8/26/2024"
    course_term = "Fall 2024"
    class_levels = [
        {"name": "Not Taught", "color": "#dddddd"},
        {"name": "Taught", "color": "#8fbc8f"}
    ]
    student_levels = [
        {"name": "First Steps", "color": "#dddddd"},
        {"name": "Needs Practice", "color": "#a3d7fc"},
        {"name": "In Progress", "color": "#59b0f9"},
        {"name": "Almost There", "color": "#3981c1"},
        {"name": "Mastered", "color": "#20476a"}
    ]

    # Assign mastery levels to the dynamic tree
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
