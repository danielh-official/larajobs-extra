import type { Plugin } from 'vite';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export function manifestPlugin(): Plugin {
	return {
		name: 'generate-manifest',
		writeBundle(options) {
			const outDir = options.dir || 'build';
			const basePath = process.env.BASE_PATH || '';

			const manifest = {
				short_name: 'LaraJobs Extra',
				name: 'LaraJobs Extra',
				start_url: basePath || '/',
				background_color: '#ffffff',
				display: 'standalone',
				scope: basePath ? `${basePath}/` : '/',
				theme_color: '#000000',
				description:
					'An enhanced job listing platform for LaraJobs with extra filtering capabilities.',
				icons: [
					{
						src: `${basePath}/icons/startup.png`,
						sizes: '192x192',
						type: 'image/png'
					},
					{
						src: `${basePath}/icons/startup.png`,
						sizes: '512x512',
						type: 'image/png'
					}
				]
			};

			try {
				mkdirSync(outDir, { recursive: true });
				writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
				console.log('✓ Generated manifest.json with base path:', basePath || '(root)');
			} catch (error) {
				console.error('Failed to generate manifest.json:', error);
			}
		}
	};
}
