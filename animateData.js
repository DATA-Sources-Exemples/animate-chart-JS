/*
Plugin Name: amCharts Animate Data
Description: Smoothly animates the `dataProvider`
Author: Paul Chapman, amCharts
Version: 1.0.0
Author URI: http://www.amcharts.com/

Copyright 2015 amCharts

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

Please note that the above license covers only this plugin. It by all means does
not apply to any other amCharts products that are covered by different licenses.
*/

/* globals AmCharts */
/* jshint -W061 */

( function() {
	"use strict";


	function raf( self ) {
		requestAnimationFrame( function( now ) {
			self._onFrame( now );
		} );
	}


	function noop( now ) {}


	function Animation( duration, start, tick, end ) {
		this._finished = false;
		this._startTime = null;
		this._duration = duration;
		this._start = ( start == null ? noop : start );
		this._tick = ( tick == null ? noop : tick );
		this._end = ( end == null ? noop : end );
	}

	Animation.prototype.cancel = function() {
		this._finished = true;
		this._startTime = null;
		this._duration = null;
		this._start = null;
		this._tick = null;
		this._end = null;
	};

	Animation.prototype._onFrame = function( now ) {
		// This will only happen when the animation was cancelled
		if ( this._finished ) {
			return true;

		} else if ( this._startTime === null ) {
			this._startTime = now;
			this._start( 0 );
			return false;

		} else {
			var diff = now - this._startTime;

			if ( diff < this._duration ) {
				this._tick( diff / this._duration );
				return false;

			} else {
				this._end( 1 );
				// Cleanup all the properties
				this.cancel();
				return true;
			}
		}
	};


	function Animator() {
		this._animating = false;
		this._animations = [];
		this._onBeforeFrames = [];
		this._onAfterFrames = [];
	}


	Animator.prototype.animate = function( options ) {
		var animation = new Animation(
			options.duration,
			options.start,
			options.tick,
			options.end
		);

		this._animations.push( animation );

		if ( !this._animating ) {
			this._animating = true;

			raf( this );
		}

		return animation;
	};


	Animator.prototype.onBeforeFrame = function( f ) {
		this._onBeforeFrames.push( f );
	};

	Animator.prototype.onAfterFrame = function( f ) {
		this._onAfterFrames.push( f );
	};


	Animator.prototype._onFrame = function( now ) {
		var onBeforeFrames = this._onBeforeFrames;

		for ( var i = 0; i < onBeforeFrames.length; ++i ) {
			onBeforeFrames[ i ]( now );
		}


		var animations = this._animations;

		for ( var i = 0; i < animations.length; ++i ) {
			var animation = animations[ i ];

			// If the animation is finished...
			if ( animation._onFrame( now ) ) {
				// TODO this is a bit slow, but I don't know of a faster alternative
				animations.splice( i, 1 );
				--i;
			}
		}


		var onAfterFrames = this._onAfterFrames;

		for ( var i = 0; i < onAfterFrames.length; ++i ) {
			onAfterFrames[ i ]( now );
		}


		// All animations are finished
		if ( animations.length === 0 ) {
			this._animating = false;

		} else {
			raf( this );
		}
	};


	var _animator = new Animator();

	AmCharts.animate = function( options ) {
		return _animator.animate( options );
	};

	AmCharts.tween = function( time, from, to ) {
		return ( time * ( to - from ) ) + from;
	};


	function easeInOut3( t ) {
		var r = ( t < 0.5 ? t * 2 : ( 1 - t ) * 2 );
		r *= r * r * r;
		return ( t < 0.5 ? r / 2 : 1 - ( r / 2 ) );
	}

	function easeIn3( t ) {
		t *= t * t * t;
		return t;
	}

	function easeOut3( t ) {
		var r = ( 1 - t );
		r *= r * r * r;
		return ( 1 - r );
	}


	var needsValidation = [];

	function map( array, fn ) {
		var length = array.length;
		var output = new Array( length );

		for ( var i = 0; i < length; ++i ) {
			output[ i ] = fn( array[ i ] );
		}

		return output;
	}

	function pushNew( array, x ) {
		for ( var i = 0; i < array.length; ++i ) {
			if ( array[ i ] === x ) {
				return;
			}
		}

		array.push( x );
	}

	// TODO check the performance of this
	_animator.onAfterFrame( function() {
		for ( var i = 0; i < needsValidation.length; ++i ) {
			needsValidation[ i ].validateData();
		}

		needsValidation.length = 0;
	} );


	function getKeys( chart ) {
		var keys = [];

		for ( var i = 0; i < chart.graphs.length; ++i ) {
			var graph = chart.graphs[ i ];

			// TODO support for other properties
			if ( graph.valueField != null ) {
				keys.push( graph.valueField );
			}
		}

		return keys;
	}


	function getValues( a, keys ) {
		return map( a, function ( data ) {
			var values = {};

			for ( var i = 0; i < keys.length; ++i ) {
				var key = keys[ i ];

				values[ key ] = data[ key ];
			}

			return values;
		} );
	}


	function animateData( data, options ) {
		var chart = this;

		var easing = options.easing || easeOut3;

		var keys = getKeys( chart );

		var dataProvider = chart.dataProvider;

		var oldValues = getValues( dataProvider, keys );
		var newValues = getValues( data, keys );

		function tick( time ) {
			time = easing( time );

			for ( var i = 0; i < newValues.length; ++i ) {
				var oldData = oldValues[ i ];
				var newData = newValues[ i ];
				var data = dataProvider[ i ];

				for ( var j = 0; j < keys.length; ++j ) {
					var key = keys[ j ];

					data[ key ] = AmCharts.tween(
						time,
						oldData[ key ],
						newData[ key ]
					);
				}
			}

			// TODO check the performance of this
			pushNew( needsValidation, chart );
		}

		return AmCharts.animate( {
			duration: options.duration,
			tick: tick,
			end: function ( time ) {
				tick( time );

				if ( options.complete != null ) {
					options.complete();
				}
			}
		} );
	}


	AmCharts.addInitHandler( function( chart ) {
		chart.animateData = animateData;
	}, [ "serial" ] );

} )();
