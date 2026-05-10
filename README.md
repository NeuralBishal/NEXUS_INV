# NEXUS_INV 📦

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Google Sheets API](https://img.shields.io/badge/Google%20Sheets-API-brightgreen)](https://developers.google.com/sheets/api)

> A powerful inventory management application that syncs with Google Sheets, allowing you to view, edit, and manage your inventory seamlessly.

## 🌐 Live Demo

Try the application live:  
**[Mines Store Inventory](https://inventory-sync--bishalmajumdar5.replit.app)**

### Demo Credentials
- **Username:** `admin`
- **Password:** `admin@123`

> ⚠️ This is a demo instance. Data may be reset periodically. Do not store sensitive information.

## 📋 Overview

NEXUS_INV bridges the gap between spreadsheet simplicity and inventory management power. It connects directly to your Google Sheets files, syncs inventory data in real-time, and provides a user-friendly interface to manage your stock, track items, and maintain inventory records.

## ✨ Features

- **Google Sheets Integration** - Import and sync inventory data directly from Google Sheets
- **Real-time Sync** - Changes made in the app reflect in your Google Sheets
- **Full CRUD Operations** - Create, Read, Update, and Delete inventory items
- **Customizable Views** - Organize and filter inventory data the way you want
- **User-friendly Interface** - Easy to navigate and manage large inventories
- **Data Validation** - Ensures data consistency between app and sheets

## 🚀 Getting Started

### Prerequisites

- Python 3.8+ or Node.js (depending on your stack)
- Google Cloud Platform account (for Sheets API)
- Google Service Account or OAuth credentials

### Installation

```bash
# Clone the repository
git clone https://github.com/NeuralBishal/NEXUS_INV.git
cd NEXUS_INV

# Install dependencies (choose your stack)
# For Python:
pip install -r requirements.txt

# For Node.js:
npm install
Google Sheets Setup

Go to Google Cloud Console
Create a new project or select existing
Enable Google Sheets API
Create credentials (Service Account or OAuth 2.0)
Download credentials JSON file
Share your Google Sheet with the service account email
Configuration

Create a .env file:

env
GOOGLE_SHEETS_CREDENTIALS=path/to/credentials.json
SPREADSHEET_ID=your_google_sheet_id
PORT=3000
Running the App

bash
# Start the application
python app.py
# or
npm start
📖 How It Works

Connection - App authenticates with Google Sheets API
Sync - Pulls inventory data from specified Google Sheet
Management - Users can view, edit, add, or delete items through the interface
Write-back - Changes are automatically synced back to Google Sheets
Real-time Updates - Any external sheet changes reflect in the app
🗂️ Sheet Structure Example

Your Google Sheet should have headers like:

Product ID	Name	Category	Quantity	Price	Last Updated
INV-001	Widget A	Electronics	150	$19.99	2024-01-15
🛠️ Built With

[Python/Node.js] - Backend logic
Google Sheets API v4 - Spreadsheet integration
[Flask/Express] - Web framework (if applicable)
[React/Vanilla JS] - Frontend interface
📁 Project Structure

text
NEXUS_INV/
├── src/
│   ├── sheets/      # Google Sheets integration
│   ├── inventory/   # Inventory management logic
│   └── ui/          # User interface components
├── config/          # Configuration files
├── tests/           # Unit tests
├── requirements.txt # Dependencies
└── README.md
🔒 Security

OAuth 2.0 authentication for Google Services
Environment variables for sensitive data
No permanent storage of sheet credentials
Rate limiting to prevent API abuse
🤝 Contributing

Contributions are welcome!

Fork the project
Create your feature branch (git checkout -b feature/AmazingFeature)
Commit changes (git commit -m 'Add AmazingFeature')
Push to branch (git push origin feature/AmazingFeature)
Open a Pull Request
📝 Roadmap

Bulk import/export
Barcode scanning support
Low stock alerts
Inventory analytics dashboard
Multi-sheet support
Export to CSV/Excel
User roles and permissions
🐛 Known Issues

See Issues page

📄 License

Distributed under the MIT License. See LICENSE for more information.

👤 Author

NeuralBishal

GitHub: @NeuralBishal
🙏 Acknowledgments

Google Sheets API team
All contributors and users
📧 Support

For issues or questions, please open an issue on GitHub.

text

## Quick Commands to Add This README:

```bash
# Create the README file
cat > README.md << 'EOF'
[Paste the entire README content above here]
EOF

# Add and commit
git add README.md
git commit -m "Add comprehensive README for NEXUS_INV inventory management system"

# Push to GitHub
git push origin main
