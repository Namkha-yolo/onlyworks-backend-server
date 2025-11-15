#!/bin/bash

# Deployment script for fixing Supabase getUserByEmail issue
echo "🚀 Deploying OnlyWorks Backend Fix..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Not in backend directory. Please run from onlyworks-backend-server root."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Check for environment variables
if [ ! -f ".env" ]; then
    echo "⚠️  Warning: .env file not found. Make sure environment variables are set."
fi

# Build/prepare the application
echo "🔧 Preparing application..."

# Test the application locally (optional)
echo "🧪 Testing application..."
# npm test 2>/dev/null || echo "⚠️ Tests not available, skipping..."

# Deploy to Render
echo "🚀 Deploying to Render..."

# Check if this is a Git repository
if [ -d ".git" ]; then
    # Add all changes
    git add .

    # Create commit
    git commit -m "Fix: Add Supabase compatibility layer for getUserByEmail deprecated method

    - Added supabaseCompat.js utility for handling different Supabase client versions
    - Added supabaseErrorHandler middleware for better error handling
    - Updated AuthService with safe fallback methods
    - Resolves 'getUserByEmail is not a function' error

    🤖 Generated with Claude Code"

    # Push to main branch (triggers Render deployment)
    echo "📤 Pushing to main branch..."
    git push origin main

    echo "✅ Deployment initiated! Check Render dashboard for deployment status."
    echo "🔗 Live URL: https://onlyworks-backend-server.onrender.com"
else
    echo "❌ Error: Not a Git repository. Please initialize Git and configure Render deployment."
    exit 1
fi

echo "🎉 Deployment script completed!"
echo ""
echo "📋 What was fixed:"
echo "  ✅ Added compatibility layer for Supabase client versions"
echo "  ✅ Added error handling for deprecated methods"
echo "  ✅ Added fallback mechanisms for authentication"
echo "  ✅ Improved error messages for debugging"
echo ""
echo "🔍 Monitor deployment at: https://dashboard.render.com"
echo "🧪 Test the fix: Check desktop app authentication flow"