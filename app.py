from flask import Flask, render_template, request, jsonify
import smtplib
from email.message import EmailMessage
import ssl
import os

# Define the base directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Initialize the Flask application
app = Flask(
    __name__,
    static_folder=os.path.join(BASE_DIR, 'static'),
    template_folder=os.path.join(BASE_DIR, 'templates')
)

# Define the home route


@app.route('/')
def home():
    return render_template('index.html')


# Contact form endpoint: accepts POST (application/json)
@app.route('/contact', methods=['POST'])
def contact():
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    sender = data.get('email', '').strip()
    message_text = data.get('message', '').strip()

    if not name or not sender or not message_text:
        return jsonify({'ok': False, 'error': 'Missing name, email or message'}), 400

    # Email settings from environment variables
    SMTP_HOST = os.environ.get('SMTP_HOST')
    SMTP_PORT = int(os.environ.get('SMTP_PORT', '587'))
    SMTP_USER = os.environ.get('SMTP_USER')
    SMTP_PASS = os.environ.get('SMTP_PASS')
    SMTP_USE_TLS = os.environ.get(
        'SMTP_USE_TLS', '1') not in ('0', 'False', 'false')
    SENDER_EMAIL = os.environ.get(
        'SENDER_EMAIL', SMTP_USER or 'no-reply@example.com')
    RECIPIENT = os.environ.get(
        'CONTACT_RECIPIENT', 'johnsonjoel@bentonvillek12.org')

    if not SMTP_HOST or not SMTP_USER or not SMTP_PASS:
        # Development fallback: log the message to a local file so the contact form can be tested
        log_path = os.path.join(BASE_DIR, 'sent_emails.log')
        try:
            with open(log_path, 'a', encoding='utf-8') as f:
                f.write('\n---\n')
                f.write(f'To: {RECIPIENT}\n')
                f.write(f'From: {sender} ({name})\n')
                f.write(f'Message:\n{message_text}\n')
            return jsonify({'ok': True, 'message': f'Email saved to {log_path} (SMTP not configured)'}), 200
        except Exception as e:
            return jsonify({'ok': False, 'error': f'Failed to save email locally: {e}'}), 500

    # Build the email message
    msg = EmailMessage()
    msg['Subject'] = f'StandTall Contact from {name}'
    msg['From'] = SENDER_EMAIL
    msg['To'] = RECIPIENT
    body = f'Name: {name}\nEmail: {sender}\n\nMessage:\n{message_text}\n'
    msg.set_content(body)

    try:
        if SMTP_USE_TLS:
            context = ssl.create_default_context()
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
                server.starttls(context=context)
                server.login(SMTP_USER, SMTP_PASS)
                server.send_message(msg)
        else:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as server:
                server.login(SMTP_USER, SMTP_PASS)
                server.send_message(msg)
    except Exception as e:
        return jsonify({'ok': False, 'error': f'Failed to send email: {e}'}), 500

    return jsonify({'ok': True, 'message': 'Email sent'})


# Run the application
if __name__ == '__main__':
    app.run(debug=True)
