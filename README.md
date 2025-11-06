# OnlyWorks Backend Server

Backend API server for OnlyWorks Desktop App, deployed on Vercel.

## Overview

This server handles:
- **AI Analysis**: Proxy requests to Google Gemini API for screenshot analysis
- **OAuth Authentication**: Handle OAuth callbacks from Google/GitHub
- **Secure API Keys**: Keep sensitive credentials server-side

## API Endpoints

### Health Check
```
GET /api/health
```
Returns server health status.

### AI Analysis
```
POST /api/analyze
Content-Type: application/json

{
  "imageBase64": "base64_encoded_image_data",
  "analysisType": "full" | "ocr" | "object_detection" | "activity_classification"
}
```
Returns AI analysis results.

### OAuth Login
```
POST /api/auth/login
Content-Type: application/json

{
  "provider": "google" | "github"
}
```
Returns OAuth URL for authentication.

### OAuth Callback
```
GET /api/auth/callback?code=...&access_token=...
```
Handles OAuth redirect and exchanges code for tokens.

## Local Development

1. **Install Dependencies**
```bash
cd server
npm install
```

2. **Set Up Environment Variables**
```bash
cp .env.example .env
# Edit .env with your actual credentials
```

3. **Run Development Server**
```bash
npm run dev
```

Server will be available at `http://localhost:3000`

## Vercel Deployment

### First Time Setup

1. **Install Vercel CLI**
```bash
npm install -g vercel
```

2. **Login to Vercel**
```bash
vercel login
```

3. **Deploy**
```bash
cd server
vercel
```

Follow the prompts to create a new project.

### Environment Variables on Vercel

Set these in your Vercel dashboard (Project Settings → Environment Variables):

- `GOOGLE_API_KEY` - Your Google Gemini API key
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (optional)
- `GITHUB_CLIENT_ID` - GitHub OAuth client ID (optional)
- `GITHUB_CLIENT_SECRET` - GitHub OAuth client secret (optional)
- `GOOGLE_CLIENT_ID` - Google OAuth client ID (optional)
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret (optional)
- `JWT_SECRET` - Random secret for JWT signing (optional)

### Production Deployment

```bash
cd server
npm run deploy
```

Or use:
```bash
vercel --prod
```

## Update Supabase OAuth Redirect URLs

After deploying to Vercel, update your Supabase OAuth settings:

1. Go to Supabase Dashboard → Authentication → URL Configuration
2. Add your Vercel URL to **Redirect URLs**:
   ```
   https://your-project.vercel.app/api/auth/callback
   ```

## Security Notes

- ✅ API keys are stored server-side as environment variables
- ✅ CORS is enabled for the Electron app
- ✅ OAuth flow uses secure server-to-server communication
- ⚠️ Make sure to set proper CORS origins in production

## Troubleshooting

### "AI service not available"
- Check that `GOOGLE_API_KEY` is set in Vercel environment variables
- Verify the API key is valid and has billing enabled

### "Supabase not configured"
- Ensure `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set
- Check that values don't have extra quotes or whitespace

### OAuth redirect not working
- Verify the redirect URL in Supabase matches your Vercel URL
- Check browser console for CORS errors
- Ensure callback endpoint is accessible

## Cost Considerations

- Vercel Free Tier: 100GB bandwidth, 100GB-hours compute
- Google Gemini API: Check current pricing at https://ai.google.dev/pricing
- Supabase Free Tier: 500MB database, 1GB file storage, 2GB bandwidth

## Project Structure

```
server/
├── api/
│   ├── analyze.js           # AI analysis endpoint
│   ├── health.js            # Health check
│   └── auth/
│       ├── login.js         # OAuth initiation
│       └── callback.js      # OAuth callback
├── package.json
├── vercel.json              # Vercel configuration
├── .env.example             # Environment variables template
└── README.md                # This file
```

## Next Steps

After deploying the server:

1. Note your Vercel URL (e.g., `https://onlyworks-backend.vercel.app`)
2. Update the Electron app to use this URL for API calls
3. Update Supabase OAuth redirect URLs
4. Test OAuth flow and AI analysis
5. Remove API keys from Electron app

## Support

For issues or questions, create an issue in the main OnlyWorks repository.
