import { Dexie, type EntityTable } from 'dexie';

interface JobPosting {
	id?: number;
	guid: string;
	name: string;
	link: string;
	published_date: string;
	parsed_published_date?: Date;
	creator: string;
	category: string;
	location: string;
	job_type: string;
	salary: string;
	company: string;
	company_logo: string;
	tags: string[];
}

const db = new Dexie('LaraJobsExtraDB') as Dexie & {
	postings: EntityTable<
		JobPosting,
		'id' // primary key "id" (for the typings only)
	>;
};

db.version(1).stores({
	postings: [
		'++id',
		'guid',
		'name',
		'link',
		'published_date',
		'parsed_published_date',
		'creator',
		'category',
		'location',
		'job_type',
		'salary',
		'company',
		'company_logo',
		'tags'
	].join(', ') // Primary key and indexed props
});

export type { JobPosting };
export { db };
