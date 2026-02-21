import type { RequestHandler } from './$types';
import { subscribeToProgress, getJobStatus } from '$lib/server/downloader';

export const GET: RequestHandler = async ({ params }) => {
	const jobId = params.id;

	// Check if job exists
	const job = getJobStatus(jobId);
	if (!job) {
		return new Response('Job not found', { status: 404 });
	}

	// Create SSE stream
	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			// Send initial connection message
			controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', jobId })}\n\n`));

			// Subscribe to progress updates
			const unsubscribe = subscribeToProgress(jobId, (progress) => {
				try {
					const data = JSON.stringify({ type: 'progress', ...progress });
					controller.enqueue(encoder.encode(`data: ${data}\n\n`));

					// Close stream when all tracks are done
					const currentJob = getJobStatus(jobId);
					if (currentJob) {
						const allDone = Array.from(currentJob.progress.values()).every(
							(p) => p.status === 'complete' || p.status === 'error' || p.status === 'skipped'
						);
						const allTracksReported = currentJob.progress.size >= currentJob.tracks.length;

						if (allDone && allTracksReported) {
							controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
							unsubscribe();
							controller.close();
						}
					}
				} catch {
					// Stream closed by client
					unsubscribe();
				}
			});

			// Handle client disconnect
			return () => {
				unsubscribe();
			};
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
