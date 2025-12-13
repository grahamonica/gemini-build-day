This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Create a .env.local file with the following variables:

```bash
GEMINI_API_KEY=your_gemini_api_key
NANO_BANANA_API_KEY=your_nano_banana_api_key
```

## Video Generation (Nano Banana)

The whiteboard includes a video generation feature that uses the **Nano Banana API** to create animated videos from your drawings.

### Setup

1. **Get a Nano Banana API Key**:
   - Sign up for an account at [nanobananavideo.com](https://nanobananavideo.com)
   - Navigate to your dashboard to create and retrieve your API key
   - Add it to your `.env.local` file as `NANO_BANANA_API_KEY`

2. **Usage**:
   - Draw on the whiteboard
   - Click the video icon (🎥) button in the toolbar to generate an animated video
   - The video generation may take a few moments (the API processes videos asynchronously)
   - You can cancel the generation at any time using the cancel button (X)
   - Once complete, the video will appear and you can download it

The system automatically captures frames while you're drawing (every 500ms) and sends the final frame to Nano Banana API for video generation.

Then, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
