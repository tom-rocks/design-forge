# Design Forge

A beautiful interface for AI image generation using Gemini Pro 3 via Krea's API.

## Features

- **Image Generation**: Generate images with text prompts using Gemini Pro 3
- **Resolution Options**: 1K (1024px), 2K (2048px), or 4K (4096px)
- **Aspect Ratios**: 1:1, 16:9, 9:16, 4:3, 3:4
- **Advanced Settings**: Negative prompts and seed for reproducibility
- **Dark Minimal UI**: Clean, modern interface with smooth animations

## Getting Started

### Prerequisites

- Node.js 18+
- Krea API key (get one at https://krea.ai/settings/api-tokens)

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm run install:all
   ```

3. Create a `.env` file in the root directory:
   ```
   KREA_API_KEY=your_api_key_here
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open http://localhost:5173 in your browser

## Tech Stack

- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **Backend**: Express.js + TypeScript
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **API**: Krea API (Gemini Pro 3)

## Deployment

The app is designed to be deployed on Railway:

1. Push to GitHub
2. Connect to Railway
3. Set `KREA_API_KEY` environment variable
4. Deploy!

## License

MIT
