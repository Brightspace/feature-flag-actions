const action = require( './' );
const { rm: rmFile, writeFile } = require( 'fs' ).promises;
const { join: joinPath } = require( 'path' );
const nock = require( 'nock' );
const { v4: uuidv4 } = require( 'uuid' );

const githubEndpoint = 'https://api.github.com';
const nockOptions = Object.freeze( { allowUnmocked: false } );

const owner = 'test_owner';
const repo = 'test_repo';
const pullNumber = 123;
const githubToken = 'xyz123';

const tempFiles = [];

beforeEach( () => {

	nock( githubEndpoint, nockOptions )
		.get( '/_nock' )
		.reply( 200, 'OK!' );
} );

afterEach( () => {
	nock.cleanAll();
} );

async function afterAll() {
	for( const path in tempFiles ) {
		await rmFile( path );
	}
}

async function jsonTempFile( content ) {

	const json = JSON.stringify( content, null, '\t' );
	const path = joinPath( __dirname, `tmp/${uuidv4()}.json` );
	await writeFile( path, json, { encoding: 'utf8' } );
	tempFiles.push( path );
	return path;
}

test( 'no chnages', async () => {

	const eventPath = await jsonTempFile( {
		pull_request: {
			number: pullNumber
		}
	} );

	const comparisonPath = await jsonTempFile( {
		flags: {}
	} );

	process.env = {
		GITHUB_EVENT_PATH: eventPath,
		GITHUB_REPOSITORY: `${owner}/${repo}`,
		GITHUB_SHA: '3da541559918a808c2402bba5012f6c60b27661c',

		'INPUT_COMPARISON-PATH': comparisonPath,
		INPUT_ENVIRONMENTS: 'test',
		'INPUT_GITHUB-TOKEN': githubToken,
	};

	let approveBody = null;
	const approveRequest = nock( githubEndpoint, nockOptions )
		.post( `/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, body => {
			approveBody = body;
			return true;
		} )
		.reply( 200, {
			id: 80,
			user: {
				login: 'github-actions[bot]'
			}
		} );

	await action();

	approveRequest.done();
} );
