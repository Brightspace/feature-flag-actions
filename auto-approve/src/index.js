const githubActionsBot = 'github-actions[bot]';

const Ajv = require( 'ajv' );
const core = require( '@actions/core' );
const github = require( '@actions/github' );
const { readFile } = require( 'fs' ).promises;

const ajv = new Ajv();
const comparisonSchema = require( './conversion.schema.json' );
const comparisonValidator = ajv.compile( comparisonSchema );

function canAutoApprove( comparison, environments ) {

	for( const flag of Object.values( comparison.flags ) ) {
		for( const [ envKey, env ] of Object.entries( flag.environments ) ) {

			if( env.change === 'none' ) {
				continue;
			}

			if( environments.has( envKey ) ) {
				continue;
			}

			console.info( `Cannot auto approve with changes to the '${ envKey }' environment.` );
			return false;
		}
	}

	return true;
}

async function readComparison( path ) {

	const comparisonJson = await readFile(
		path,
		{ encoding: 'utf8' }
	);

	const comparison = JSON.parse( comparisonJson );

	const valid = comparisonValidator( comparison );
	if( !valid ) {
		throw new Ajv.ValidationError( comparisonValidator.errors );
	}

	return comparison;
}

function parseEnvironmentsSet( environments ) {

	const environmentsSet = new Set();

	for( const env of environments.split( ';' ) ) {
		environmentsSet.add( env );
	}

	return environmentsSet;
}

async function approve( octokit, pull_params ) {

	const request = {
		...pull_params,
		commit_id: github.context.sha,
		event: 'APPROVE'
	};

	const response = await octokit.pulls.createReview( request );
	const review = response.data;

	const login = review.user.login;
	if( login !== githubActionsBot ) {
		throw new Error( `Should have approved pull request as '${ githubActionsBot }' instead of '${ login }'.` );
	}

	console.info( `Approved pull request. (id: ${ review.id })` );
}

async function* listApprovals( octokit, pull_params ) {

	const responseIterator = octokit.paginate.iterator(
		octokit.pulls.listReviews,
		{ ...pull_params }
	);

	for await ( const response of responseIterator ) {
		for( const review of response.data ) {

			const login = review.user.login;
			if( login !== githubActionsBot ) {
				continue;
			}

			if( review.state === 'DISMISSED' ) {
				continue;
			}

			yield review;
		}
	}
}

async function dismiss( octokit, pull_params ) {

	const reviewsIterator = listApprovals( octokit, pull_params );
	for await ( const review of reviewsIterator ) {

		const id = review.id;

		const request = {
			...pull_params,
			review_id: id,
			message: 'Auto approval no longer applicable.'
		};

		await octokit.pulls.dismissReview( request );

		console.info( `Dismissed approval. (id: ${ id })` );
	}
}

async function run() {

	const { pull_request } = github.context.payload;
	if( !pull_request ) {
		throw new Error( 'Context missing \'pull_request\'.' );
	}

	const repo = github.context.repo;

	const pull_params = Object.freeze( {
		owner: repo.owner,
		repo: repo.repo,
		pull_number: pull_request.number
	} );

	const comparisonPath = core.getInput(
			'comparison-path',
			{ required: true }
		);

	const environments = core.getInput(
			'environments',
			{ required: true }
		);

	const githubToken = core.getInput(
			'github-token',
			{ required: true }
		);

	const comparison = await readComparison( comparisonPath );
	const environmentsSet = parseEnvironmentsSet( environments );

	const octokit = github.getOctokit( githubToken );

	const autoApprove = canAutoApprove( comparison, environmentsSet );
	if( autoApprove ) {
		await approve( octokit, pull_params );
	} else {
		await dismiss( octokit, pull_params );
	}
}

if ( require.main === module ) {
	run().catch( err => {
		core.setFailed( err );
	} );
}

module.exports = run;
