import re
import json


class Node:
    count = 0

    def __init__(self, label, style, week, parent=None, children=None):
        self.id = Node.count + 1
        self.label = label
        self.style = style
        self.week = int(week)
        self.parent = parent
        if children is None:
            children = []
        self.children = children
        Node.count += 1


def read_meta(f):
    Node.count = 0
    name = ""
    term = ""
    orientation = ""
    start_date = []
    styles = {}
    class_levels = []
    student_levels = []
    nodes = []
    root = Node(label="", style="root", week=0, parent=None, children=nodes)

    parse_mode = None

    cur_node_parent = None
    cur_node_parent_depth = 0

    for line in f.readlines():
        if line.startswith("name:"):
            name = re.search(r"name: ([A-Za-z0-9\-_]+)", line).group(1)
        if line.startswith("term:"):
            term_match = re.search(r"term: ([A-Za-z0-9]+) ([0-9]+)", line)
            term = "{} {}".format(term_match.group(1), term_match.group(2))
        if line.startswith("orientation:"):
            orientation_match = re.search(r"orientation: ([A-Za-z]+) to ([A-Za-z]+)", line)
            orientation = "LR" if orientation_match.group(1) == "left" and orientation_match.group(
                2) == "right" else "RL"
        if line.startswith("start date:"):
            date_match = re.search(r"start date: (\d{4}) (\d{2}) (\d{2})", line)
            start_date.extend([int(date_match.group(1)), int(date_match.group(2)), int(date_match.group(3))])
        if line.startswith("styles:"):
            parse_mode = "STYLE"
            continue
        if line.startswith("class levels:"):
            parse_mode = "CLASS_LEVEL"
            continue
        if line.startswith("student levels:"):
            parse_mode = "STUDENT_LEVEL"
            continue
        if line.startswith("nodes:"):
            parse_mode = "NODE"
            continue
        if line.startswith("end"):
            parse_mode = None

        if parse_mode == "STYLE":
            style_match = re.search(
                r"name: ([A-Za-z0-9]+), shape: ([A-Za-z]+), style: ([A-Za-z]+), fillcolor: #([A-Za-z0-9]+)", line)
            styles[style_match.group(1)] = {
                "shape": style_match.group(2),
                "style": style_match.group(3),
                "fillcolor": "#{}".format(style_match.group(4))
            }
        elif parse_mode == "CLASS_LEVEL":
            level_match = re.search(r"\s*([A-Za-z-_\s]+): #([A-Za-z0-9]+)", line)
            class_levels.append({"name": level_match.group(1), "color": "#{}".format(level_match.group(2))})
        elif parse_mode == "STUDENT_LEVEL":
            level_match = re.search(r"\s*([A-Za-z-_\s]+): #([A-Za-z0-9]+)", line)
            student_levels.append({"name": level_match.group(1), "color": "#{}".format(level_match.group(2))})
        elif parse_mode == "NODE":
            node_match = re.search(r"(\s+)([A-Za-z0-9\-\s\\/]+) \[([A-Za-z0-9]+), Week([0-9]+)]", line)
            root.week = max(root.week, int(node_match.group(4)))
            if len(node_match.group(1)) // 4 == 1:
                cur_node_parent = Node(node_match.group(2), node_match.group(3), node_match.group(4))
                nodes.append(cur_node_parent)
                cur_node_parent_depth = 1
            elif len(node_match.group(1)) // 4 < cur_node_parent_depth:
                cur_node_parent = cur_node_parent.parent
                cur_node_parent_depth -= 1
                cur_node_parent.parent.children.append(
                    Node(node_match.group(2), node_match.group(3), node_match.group(4), cur_node_parent))
            elif len(node_match.group(1)) // 4 == cur_node_parent_depth:
                new_children = Node(node_match.group(2), node_match.group(3), node_match.group(4), cur_node_parent.parent)
                cur_node_parent.parent.children.append(new_children)
                cur_node_parent = new_children
            elif len(node_match.group(1)) // 4 > cur_node_parent_depth:
                new_children = Node(node_match.group(2), node_match.group(3), node_match.group(4), cur_node_parent)
                cur_node_parent.children.append(new_children)
                cur_node_parent = new_children
                cur_node_parent_depth += 1

    f.close()

    root.label = name

    return name, orientation, start_date, term, class_levels, student_levels, styles, root


def to_json(school_name, course_name, term, start_date, class_levels, student_levels, root, render=False):
    def nodes_to_json(node):
        if render or node.children:
            nodes_json = {
                "id": node.id,
                "name": node.label,
                "parent": node.parent.label if node.parent else "null",
                "children": [nodes_to_json(c) for c in node.children],
                "data": {
                    "week": node.week,
                }
            }
        else:
            nodes_json = {
                "id": node.id,
                "name": node.label,
                "parent": node.parent.label if node.parent else "null",
                "data": {
                    "week": node.week,
                }
            }
        return nodes_json

    json_out = {
        "name": course_name,
        "term": term,
        "start date": "{}/{}/{}".format(start_date[1], start_date[2], start_date[0]),
        "class levels": class_levels,
        "student levels": student_levels,
        "count": Node.count,
        "nodes": nodes_to_json(root)
    }

    with open('data/{}_{}.json'.format(school_name, course_name), 'w', encoding='utf-8') as json_out_file:
        json.dump(json_out, json_out_file, indent=4)

def generate_map(school_name, course_name, render=False):
    print("Log: {}_{}".format(school_name, course_name))
    try:
        with open("meta/{}_{}.txt".format(school_name, course_name), "r") as f:
            name, orientation, start_date, term, class_levels, student_levels, styles, root = read_meta(f)
            to_json(school_name, course_name, term, start_date, class_levels, student_levels, root, render)
    except FileNotFoundError:
        return
    
#This is a function pulled out from app.route('/', methods=["GET"])
#I pulled it out because I want to reuse it
def assign_node_levels(node, student_levels_count, class_levels_count, student_mastery, class_mastery):
        """
        node(json)
        student_levels_count(int)
        class_levels_count(int)
        student_mastery(str)
        class_mastery(str)
        """
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
                student_level, class_level = assign_node_levels(child, student_levels_count, class_levels_count, student_mastery, class_mastery)
                children_student_levels.append(student_level)
                children_class_levels.append(class_level)
            node["student_level"] = sum(children_student_levels) // len(children_student_levels)
            node["class_level"] = sum(children_class_levels) // len(children_class_levels)
        return node["student_level"], node["class_level"]

def update_node_mastery(node, mastery_dict):
    """
    Recursively update the 'student_level' of leaf nodes based on the mastery_dict.
    Arguments:
        -node: 
            JSON
        -mastery_dict: 
            JSON with the format:
            {
                "Name of Concept1": "Mastery Level", 
                "Name of Concept2": "Mastery Level",
                ....
            }
    """
    concept_name = node.get('name')
    if not node.get('children'): 
        if concept_name in mastery_dict:
            mastery_level = mastery_dict[concept_name]
            node['student_level'] = mastery_level_to_index(mastery_level)
        else:
            node['student_level'] = 0
    else:
        for child in node.get('children', []):
            update_node_mastery(child, mastery_dict)

def calculate_class_level(node):
    """
    Recursively calculate the 'class_level' for each node by averaging the 'student_level' of its children.
    Arguments:
        -node (JSON)
    """
    if not node.get('children'):
        node['class_level'] = node['student_level']
        return node['student_level']
    else:
        student_levels = []
        for child in node['children']:
            child_student_level = calculate_class_level(child)
            student_levels.append(child_student_level)
        average_level = sum(student_levels) / len(student_levels)
        node['class_level'] = average_level
        return average_level

def mastery_level_to_index(mastery_level):
    """
    Map the mastery level string to an index corresponding to 'student_levels'.

    Arguments:
        - mastery_level: str

    Return:
        - index corresponding to the mastery level.

    Note:
        The mastery levels are currently hardcoded in this function.
        If new mastery levels are added or existing ones are renamed, this function
        must also be updated manually to include those changes. Otherwise, any mastery level 
        not listed here will default to an index of 0.
    """
    mastery_levels = {
        "first steps": 0,
        "needs practice": 1,
        "in progress": 2, 
        "almost there": 3, 
        "mastered": 4
    }
    return mastery_levels.get(mastery_level.lower(), 0)
