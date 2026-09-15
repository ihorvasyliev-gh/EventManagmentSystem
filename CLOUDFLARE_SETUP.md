# Cloudflare R2 Integration Setup

To enable file uploads in your application, you need to configure a Cloudflare R2 bucket and bind it to your Cloudflare Pages project.

## 1. Create an R2 Bucket
1.  Log in to the **Cloudflare Dashboard**.
2.  Navigate to **R2**.
3.  Click **Create Bucket**.
4.  Name your bucket (e.g., `ccp-event-calendar-assets`).
5.  Click **Create Bucket**.

## 2. Bind the Bucket to Cloudflare Pages
1.  Navigate to **Workers & Pages**.
2.  Select your Pages project (e.g., `ccp-event-calendar`).
3.  Go to **Settings** > **Functions**.
4.  Scroll down to **R2 Bucket Bindings**.
5.  Click **Add Binding**.
6.  Enter the following details:
    *   **Variable name**: `BUCKET` (Must be exactly this, as used in the code).
    *   **R2 Bucket**: Select the bucket you created in Step 1.
7.  Click **Save**.

## 3. Local Development (Optional)
To test uploads locally, you can use the `wrangler` CLI to simulate the Pages environment with R2.

```bash
# Install Wrangler if you haven't
npm install -g wrangler

# Run the development server with R2 binding
npx wrangler pages dev . --r2=BUCKET
```

## 4. Troubleshooting
-   **"R2 Bucket binding 'BUCKET' not found"**: Ensure you added the binding in the Cloudflare Dashboard with the exact variable name `BUCKET`.
-   **CORS Errors**: R2 buckets might need CORS configuration if accessing directly, but since we are proxying through Cloudflare Pages Functions (`/api/upload`), standard Pages CORS rules apply.
