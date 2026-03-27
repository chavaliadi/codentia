import { NextRequest, NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

const ZIP_HARD_LIMIT_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return NextResponse.json(
            { error: 'Blob uploads are not configured. Set BLOB_READ_WRITE_TOKEN.' },
            { status: 503 }
        );
    }

    try {
        const body = await req.json() as HandleUploadBody;
        const result = await handleUpload({
            body,
            request: req,
            onBeforeGenerateToken: async (pathname) => {
                if (!pathname.toLowerCase().endsWith('.zip')) {
                    throw new Error('Only .zip uploads are allowed.');
                }

                return {
                    allowedContentTypes: [
                        'application/zip',
                        'application/x-zip-compressed',
                        'application/octet-stream',
                    ],
                    maximumSizeInBytes: ZIP_HARD_LIMIT_BYTES,
                    addRandomSuffix: true,
                    tokenPayload: JSON.stringify({ source: 'codevitals-zip-upload' }),
                };
            },
            onUploadCompleted: async () => {
                // no-op
            },
        });

        return NextResponse.json(result);
    } catch (error) {
        console.error('[blob-upload] Failed to generate upload token', error);
        return NextResponse.json(
            { error: 'Failed to initialize blob upload.' },
            { status: 500 }
        );
    }
}
