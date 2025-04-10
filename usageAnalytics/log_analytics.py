import os
import csv
import datetime
from google.cloud import logging
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

client = logging.Client(project='eecs-gradeview')

GRAPH_DIR = os.path.join(os.getcwd(), "graphs")
if not os.path.exists(GRAPH_DIR):
    os.makedirs(GRAPH_DIR)


def get_login_page(timestamp_filter):
    filter_str = (
        f'logName="projects/eecs-gradeview/logs/syslog" '
        f'AND (resource.type="gce_instance" OR resource.type="cloud_run_revision") '
        f'AND jsonPayload.message:("GET /login HTTP") '
        f'AND (severity=(DEFAULT OR INFO OR NOTICE)) '
        f'AND timestamp>="{timestamp_filter}"' 
    )

    return list(client.list_entries(filter_=filter_str, order_by=logging.DESCENDING))

def get_email_from_auth(timestamp_filter):
    filter_str = (
        f'logName="projects/eecs-gradeview/logs/syslog" '
        f'AND (resource.type="gce_instance" OR resource.type="cloud_run_revision") '
        f'AND (jsonPayload.message:("getEmailFromAuth")) '
        f'AND (severity=(DEFAULT OR INFO OR NOTICE)) '
        f'AND timestamp>="{timestamp_filter}"'

    )
    return list(client.list_entries(filter_=filter_str, order_by=logging.DESCENDING))


def get_api_v2_login(timestamp_filter):
    filter_str = (
        f'logName="projects/eecs-gradeview/logs/syslog" '
        f'AND (resource.type="gce_instance" OR resource.type="cloud_run_revision") '
        f'AND (jsonPayload.message:("api/v2/login")) '
        f'AND (severity="DEFAULT" OR severity="INFO" OR severity="NOTICE") '
        f'AND timestamp>="{timestamp_filter}"'

    )
    return list(client.list_entries(filter_=filter_str, order_by=logging.DESCENDING))


def get_student_grades(timestamp_filter):
    filter_str = (
        f'logName="projects/eecs-gradeview/logs/syslog" '
        f'AND (resource.type="gce_instance" OR resource.type="cloud_run_revision") '
        f'AND jsonPayload.message:"GET /api/v2/students/" AND jsonPayload.message:"/grades" '
        f'AND (severity="DEFAULT" OR severity="INFO" OR severity="NOTICE") '
        f'AND timestamp>="{timestamp_filter}"'

    )
    return list(client.list_entries(filter_=filter_str, order_by=logging.DESCENDING))


def get_specific_student_grades(email, timestamp_filter):
    filter_str = (
        f'logName="projects/eecs-gradeview/logs/syslog" '
        f'AND (resource.type="gce_instance" OR resource.type="cloud_run_revision") '
        f'AND (jsonPayload.message:("GET /api/v2/students/connorbernard@berkeley.edu/grades")) '
        f'AND (severity="DEFAULT" OR severity="INFO" OR severity="NOTICE") '
        f'AND timestamp>="{timestamp_filter}"'

    )
    return list(client.list_entries(filter_=filter_str, order_by=logging.DESCENDING))


def get_bins_access(timestamp_filter):
    filter_str = (
        f'logName="projects/eecs-gradeview/logs/syslog" '
        f'AND (resource.type="gce_instance" OR resource.type="cloud_run_revision") '
        f'AND (jsonPayload.message:("GET /api/v2/bins HTTP/1.0")) '
        f'AND (severity="DEFAULT" OR severity="INFO" OR severity="NOTICE") '
        f'AND timestamp>="{timestamp_filter}"'
    )
    return list(client.list_entries(filter_=filter_str, order_by=logging.DESCENDING))


def write_entries_to_csv(entries, output_csv):
    with open(output_csv, 'w', newline='') as csvfile:
        csv_writer = csv.writer(csvfile)
        csv_writer.writerow([
            "insertId",
            "jsonPayload.message",
            'labels."compute.googleapis.com/resource_name"',
            "logName",
            "receiveLocation",
            "receiveTimestamp",
            "resource.labels.instance_id",
            "resource.labels.project_id",
            "resource.labels.zone",
            "resource.type",
            "timestamp"
        ])
        
        for entry in entries:
            insert_id = getattr(entry, 'insert_id', "")
            
            if hasattr(entry, 'payload'):
                if isinstance(entry.payload, dict):
                    message = entry.payload.get("message", "")
                else:
                    message = entry.payload
            else:
                message = ""
            
            labels = getattr(entry, 'labels', {})
            compute_resource_name = labels.get("compute.googleapis.com/resource_name", "")
            
            log_name = getattr(entry, 'log_name', "")
            receive_location = getattr(entry, 'receive_location', "")
            receive_timestamp = getattr(entry, 'receive_timestamp', "")
            
            resource = getattr(entry, 'resource', {})
            if isinstance(resource, dict):
                resource_labels = resource.get("labels", {})
                resource_type = resource.get("type", "")
            else:
                resource_labels = getattr(resource, 'labels', {})
                resource_type = getattr(resource, 'type', "")
                
            instance_id = resource_labels.get("instance_id", "")
            project_id = resource_labels.get("project_id", "")
            zone = resource_labels.get("zone", "")
            
            timestamp = getattr(entry, 'timestamp', "")
            
            csv_writer.writerow([
                insert_id,
                message,
                compute_resource_name,
                log_name,
                receive_location,
                receive_timestamp,
                instance_id,
                project_id,
                zone,
                resource_type,
                timestamp
            ])


# Generic analytics function for any CSV file.
def analyze_csv_logs(csv_file, plot_title):
    df = pd.read_csv(csv_file)
    df['timestamp'] = pd.to_datetime(df['timestamp'], errors='coerce')
    df = df.dropna(subset=['timestamp'])
    daily_counts = df.groupby(df['timestamp'].dt.date).size()
    
    overall_accesses = int(daily_counts.sum())
    period_days = (df['timestamp'].max().date() - df['timestamp'].min().date()).days + 1
    average_accesses = round(overall_accesses / period_days, 2) if period_days > 0 else overall_accesses

    plt.figure(figsize=(10, 5))
    daily_counts.plot(kind='bar')
    plt.title(plot_title)
    plt.xlabel("Date")
    plt.ylabel("Number of Accesses")
    plt.tight_layout()
    
    graph_file = os.path.join(GRAPH_DIR, os.path.basename(csv_file).replace('.csv', '_graph.png'))
    plt.savefig(graph_file)
    plt.close()
    
    return overall_accesses, average_accesses, graph_file


# Analytics functions:
def analyze_login_page_logs(csv_file):
    df = pd.read_csv(csv_file)
    
    df['timestamp'] = pd.to_datetime(df['timestamp'], errors='coerce')
    df = df.dropna(subset=['timestamp'])
    
    daily_counts = df.groupby(df['timestamp'].dt.date).size()
    
    overall_accesses = int(daily_counts.sum())
    
    period_days = (df['timestamp'].max().date() - df['timestamp'].min().date()).days + 1
    average_accesses = round(overall_accesses / period_days, 2) if period_days > 0 else overall_accesses

    plt.figure(figsize=(10, 5))
    daily_counts.plot(kind='bar')
    plt.title("Login Page Access Density")
    plt.xlabel("Date")
    plt.ylabel("Number of Accesses")
    plt.tight_layout()
    
    graph_file = csv_file.replace('.csv', '_graph.png')
    plt.savefig(graph_file)
    plt.close()
    
    return overall_accesses, average_accesses, graph_file
