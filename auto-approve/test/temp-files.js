const { unlink: rmFile, writeFile } = require( 'fs' ).promises;
const { join: joinPath } = require( 'path' );
const { v4: uuidv4 } = require( 'uuid' );

const tempFiles = [];

async function jsonFile( content ) {

	const json = JSON.stringify( content, null, '\t' );
	const path = joinPath( __dirname, `tmp/${uuidv4()}.json` );
	await writeFile( path, json, { encoding: 'utf8' } );
	tempFiles.push( path );
	return path;
}

async function clean() {
	for( const path of tempFiles ) {
		await rmFile( path );
	}
}

module.exports = {
	jsonFile,
	clean,
};
