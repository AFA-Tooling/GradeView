import os
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.path.join(os.getcwd(), "cloud.json")

from flask import Flask, send_file, request, jsonify, render_template
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo  
import log_analytics
import base64


app = Flask(__name__)


CSV_DIR = os.path.join(os.getcwd(), 'logs')
GRAPH_DIR = os.path.join(os.getcwd(), 'graphs')

if not os.path.exists(CSV_DIR):
    os.makedirs(CSV_DIR)
if not os.path.exists(GRAPH_DIR):
    os.makedirs(GRAPH_DIR)

def get_timestamp_filter(days=30):
    now = datetime.now(ZoneInfo("America/Los_Angeles")).replace(tzinfo=None)
    days_ago = now - timedelta(days=days)
    return days_ago.isoformat("T") + "Z"

def cleanup_logs(base_filename):
    """Keep only the most recent log file for each type of request"""
    files = [f for f in os.listdir(CSV_DIR) if f.startswith(base_filename) and f.endswith('.csv')]
    
    # Sort files by creation time (newest first)
    files.sort(key=lambda x: os.path.getctime(os.path.join(CSV_DIR, x)), reverse=True)
    
    # Keep the first file (most recent) and delete the rest
    for file_to_remove in files[1:]:
        try:
            os.remove(os.path.join(CSV_DIR, file_to_remove))
            # Also remove the corresponding graph file if it exists
            graph_file = file_to_remove.replace('.csv', '_graph.png')
            graph_path = os.path.join(GRAPH_DIR, graph_file)
            if os.path.exists(graph_path):
                os.remove(graph_path)
        except Exception as e:
            print(f"Error removing file {file_to_remove}: {e}")

def process_log_data(log_type, email=None, days=30):
    """Common function to process log data for different endpoints"""
    ts_filter = get_timestamp_filter(days)
    
    # Get the appropriate log entries based on log_type
    if log_type == "login":
        entries = log_analytics.get_login_page(ts_filter)
        title = "Login Page Access Density"
        base_filename = "login_page_logs"
    elif log_type == "email":
        entries = log_analytics.get_email_from_auth(ts_filter)
        title = "Email Log Access Density"
        base_filename = "email_entries"
    elif log_type == "api-login":
        entries = log_analytics.get_api_v2_login(ts_filter)
        title = "API Login Access Density"
        base_filename = "api_v2_login"
    elif log_type == "student-grades":
        entries = log_analytics.get_student_grades(ts_filter)
        title = "Student Grades Access Density"
        base_filename = "student_grades"
    elif log_type == "specific-student":
        if not email:
            return None, None, None, "Email parameter is required", 400
        entries = log_analytics.get_specific_student_grades(email, ts_filter)
        title = f"Access Density for {email}"
        safe_email = email.replace("@", "_at_")
        base_filename = f"specific_student_{safe_email}"
    elif log_type == "bins":
        entries = log_analytics.get_bins_access(ts_filter)
        title = "Bins Access Density"
        base_filename = "bins_access"
    else:
        return None, None, None, f"Unknown log type: {log_type}", 400
    
    # Generate filename and path
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{base_filename}_{timestamp}.csv"
    filepath = os.path.join(CSV_DIR, filename)
    
    # Write entries to CSV
    log_analytics.write_entries_to_csv(entries, filepath)
    
    # Clean up old log files
    cleanup_logs(base_filename)
    
    # Analyze the data
    overall, average, graph_file = log_analytics.analyze_csv_logs(filepath, title)
    
    # Read the graph file
    with open(graph_file, "rb") as img_file:
        graph_base64 = base64.b64encode(img_file.read()).decode('utf-8')
    
    return filepath, overall, average, graph_base64, 200

@app.route("/")
def dashboard():
    return render_template("dashboard.html")


@app.route("/logs/<log_type>", methods=['GET'])
def get_logs(log_type):
    email = request.args.get('email') if log_type == "specific-student" else None
    
    filepath, _, _, error_msg, status_code = process_log_data(log_type, email)
    
    if status_code != 200:
        return jsonify({"error": error_msg}), status_code
        
    return send_file(filepath, as_attachment=True)

@app.route("/logs/login", methods=['GET'])
def login_logs():
    ts_filter = get_timestamp_filter()
    entries = log_analytics.get_login_page(ts_filter)
    base_filename = "login_page_logs"
    file_name = f'{base_filename}_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
    file_path = os.path.join(CSV_DIR, file_name)
    log_analytics.write_entries_to_csv(entries, file_path)
    cleanup_logs(base_filename)
    return send_file(file_path, as_attachment=True)

@app.route("/logs/email", methods=['GET'])
def email_logs():
    ts_filter = get_timestamp_filter()
    entries = log_analytics.get_email_from_auth(ts_filter)
    base_filename = "email_entries"
    file_name = f'{base_filename}_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
    file_path = os.path.join(CSV_DIR, file_name)
    log_analytics.write_entries_to_csv(entries, file_path)
    cleanup_logs(base_filename)
    return send_file(file_path, as_attachment=True)

@app.route("/logs/api-login", methods=['GET'])
def api_login_logs():
    ts_filter = get_timestamp_filter()
    entries = log_analytics.get_api_v2_login(ts_filter)
    base_filename = "api_v2_login"
    file_name = f'{base_filename}_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
    file_path = os.path.join(CSV_DIR, file_name)
    log_analytics.write_entries_to_csv(entries, file_path)
    cleanup_logs(base_filename)
    return send_file(file_path, as_attachment=True)

@app.route("/logs/student-grades", methods=['GET'])
def student_grades_logs():
    ts_filter = get_timestamp_filter()
    entries = log_analytics.get_student_grades(ts_filter)
    base_filename = "student_grades"
    file_name = f'{base_filename}_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
    file_path = os.path.join(CSV_DIR, file_name)
    log_analytics.write_entries_to_csv(entries, file_path)
    cleanup_logs(base_filename)
    return send_file(file_path, as_attachment=True)

@app.route("/logs/specific-student", methods=['GET'])
def specific_student_logs():
    ts_filter = get_timestamp_filter()
    email = request.args.get('email')
    if not email:
        return jsonify({"error": "email query parameter is required"}), 400
    entries = log_analytics.get_specific_student_grades(email, ts_filter)
    safe_email = email.replace("@", "_at_")
    base_filename = f"specific_student_{safe_email}"
    file_name = f'{base_filename}_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
    file_path = os.path.join(CSV_DIR, file_name)
    log_analytics.write_entries_to_csv(entries, file_path)
    cleanup_logs(base_filename)
    return send_file(file_path, as_attachment=True)

@app.route("/logs/bins", methods=['GET'])
def bins_logs():
    ts_filter = get_timestamp_filter()
    entries = log_analytics.get_bins_access(ts_filter)
    base_filename = "bins_access"
    file_name = f'{base_filename}_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
    file_path = os.path.join(CSV_DIR, file_name)
    log_analytics.write_entries_to_csv(entries, file_path)
    cleanup_logs(base_filename)
    return send_file(file_path, as_attachment=True)

# Analytics endpoints
@app.route("/logs/<log_type>/analytics", methods=['GET'])
def get_analytics(log_type):
    email = request.args.get('email') if log_type == "specific-student" else None
    
    _, overall, average, graph_base64, status_code = process_log_data(log_type, email)
    
    if status_code != 200:
        return jsonify({"error": graph_base64}), status_code
    
    response = {
        "overall_accesses": overall,
        "average_accesses": round(average, 2),
        "graph_image": graph_base64
    }
    return jsonify(response)

# Temporary frontend endpoints for testing
@app.route("/display/api-login/analytics", methods=['GET'])
def display_api_login_analytics():
    ts_filter = get_timestamp_filter()
    entries = log_analytics.get_api_v2_login(ts_filter)
    base_filename = "api_v2_login"
    csv_file_name = f'{base_filename}_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
    csv_file_path = os.path.join(CSV_DIR, csv_file_name)
    log_analytics.write_entries_to_csv(entries, csv_file_path)
    cleanup_logs(base_filename)
    
    overall, average, graph_file = log_analytics.analyze_csv_logs(csv_file_path, "API Login Access Density")
    
    with open(graph_file, "rb") as img_file:
        graph_base64 = base64.b64encode(img_file.read()).decode('utf-8')
    
    return render_template("analytics_result.html",
                           title="API Login",
                           overall_accesses=overall,
                           average_accesses=round(average, 2),
                           graph_image=graph_base64)

@app.route("/display/student-grades/analytics", methods=['GET'])
def display_student_grades_analytics():
    ts_filter = get_timestamp_filter()
    entries = log_analytics.get_student_grades(ts_filter)
    base_filename = "student_grades"
    csv_file_name = f'{base_filename}_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
    csv_file_path = os.path.join(CSV_DIR, csv_file_name)
    log_analytics.write_entries_to_csv(entries, csv_file_path)
    cleanup_logs(base_filename)
    
    overall, average, graph_file = log_analytics.analyze_csv_logs(csv_file_path, "Student Grades Access Density")
    
    with open(graph_file, "rb") as img_file:
        graph_base64 = base64.b64encode(img_file.read()).decode('utf-8')
    
    return render_template("analytics_result.html",
                           title="Student Grades",
                           overall_accesses=overall,
                           average_accesses=round(average, 2),
                           graph_image=graph_base64)

@app.route("/display/bins/analytics", methods=['GET'])
def display_bins_analytics():
    ts_filter = get_timestamp_filter()
    entries = log_analytics.get_bins_access(ts_filter)
    base_filename = "bins_access"
    csv_file_name = f'{base_filename}_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
    csv_file_path = os.path.join(CSV_DIR, csv_file_name)
    log_analytics.write_entries_to_csv(entries, csv_file_path)
    cleanup_logs(base_filename)
    
    overall, average, graph_file = log_analytics.analyze_csv_logs(csv_file_path, "Bins Access Density")
    
    with open(graph_file, "rb") as img_file:
        graph_base64 = base64.b64encode(img_file.read()).decode('utf-8')
    
    return render_template("analytics_result.html",
                           title="Bins",
                           overall_accesses=overall,
                           average_accesses=round(average, 2),
                           graph_image=graph_base64)

@app.route("/display/specific-student/analytics", methods=['GET'])
def display_specific_student_analytics():
    ts_filter = get_timestamp_filter()
    email = request.args.get('email')
    if not email:
        return render_template("analytics_result.html",
                               title="Error",
                               overall_accesses="",
                               average_accesses="",
                               graph_image=""), 400
    entries = log_analytics.get_specific_student_grades(email, ts_filter)
    safe_email = email.replace("@", "_at_")
    base_filename = f"specific_student_{safe_email}"
    csv_file_name = f'{base_filename}_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
    csv_file_path = os.path.join(CSV_DIR, csv_file_name)
    log_analytics.write_entries_to_csv(entries, csv_file_path)
    cleanup_logs(base_filename)
    
    overall, average, graph_file = log_analytics.analyze_csv_logs(csv_file_path, f"Access Density for {email}")
    
    with open(graph_file, "rb") as img_file:
        graph_base64 = base64.b64encode(img_file.read()).decode('utf-8')
    
    return render_template("analytics_result.html",
                           title=f"Student: {email}",
                           overall_accesses=overall,
                           average_accesses=round(average, 2),
                           graph_image=graph_base64)

@app.route("/display/<log_type>/analytics", methods=['GET'])
def display_analytics(log_type):
    email = request.args.get('email') if log_type == "specific-student" else None
    
    _, overall, average, graph_base64, status_code = process_log_data(log_type, email)
    
    if status_code != 200:
        return render_template("analytics_result.html",
                              title="Error",
                              overall_accesses="",
                              average_accesses="",
                              graph_image=""), status_code
    
    title = f"Student: {email}" if log_type == "specific-student" else log_type.replace("-", " ").title()
    
    return render_template("analytics_result.html",
                          title=title,
                          overall_accesses=overall,
                          average_accesses=round(average, 2),
                          graph_image=graph_base64)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=4000, debug=True)
