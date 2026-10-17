(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,25244,99062,38671,8930,e=>{"use strict";var t=e.i(90072);let s={name:"CopyShader",uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;


		}`};e.s(["CopyShader",0,s],99062);var r=t;class i{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error("THREE.Pass: .render() must be implemented in derived pass.")}dispose(){}}let a=new r.OrthographicCamera(-1,1,1,-1,0,1);class o extends r.BufferGeometry{constructor(){super(),this.setAttribute("position",new r.Float32BufferAttribute([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute("uv",new r.Float32BufferAttribute([0,2,0,0,2,0],2))}}let h=new o;class n{constructor(e){this._mesh=new r.Mesh(h,e)}dispose(){this._mesh.geometry.dispose()}render(e){e.render(this._mesh,a)}get material(){return this._mesh.material}set material(e){this._mesh.material=e}}e.s(["FullScreenQuad",0,n,"Pass",0,i],38671);class l extends i{constructor(e,s="tDiffuse"){super(),this.textureID=s,this.uniforms=null,this.material=null,e instanceof t.ShaderMaterial?(this.uniforms=e.uniforms,this.material=e):e&&(this.uniforms=t.UniformsUtils.clone(e.uniforms),this.material=new t.ShaderMaterial({name:void 0!==e.name?e.name:"unspecified",defines:Object.assign({},e.defines),uniforms:this.uniforms,vertexShader:e.vertexShader,fragmentShader:e.fragmentShader})),this._fsQuad=new n(this.material)}render(e,t,s){this.uniforms[this.textureID]&&(this.uniforms[this.textureID].value=s.texture),this._fsQuad.material=this.material,this.renderToScreen?e.setRenderTarget(null):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil)),this._fsQuad.render(e)}dispose(){this.material.dispose(),this._fsQuad.dispose()}}e.s(["ShaderPass",0,l],8930);class d extends i{constructor(e,t){super(),this.scene=e,this.camera=t,this.clear=!0,this.needsSwap=!1,this.inverse=!1}render(e,t,s){let r,i,a=e.getContext(),o=e.state;o.buffers.color.setMask(!1),o.buffers.depth.setMask(!1),o.buffers.color.setLocked(!0),o.buffers.depth.setLocked(!0),this.inverse?(r=0,i=1):(r=1,i=0),o.buffers.stencil.setTest(!0),o.buffers.stencil.setOp(a.REPLACE,a.REPLACE,a.REPLACE),o.buffers.stencil.setFunc(a.ALWAYS,r,0xffffffff),o.buffers.stencil.setClear(i),o.buffers.stencil.setLocked(!0),e.setRenderTarget(s),this.clear&&e.clear(),e.render(this.scene,this.camera),e.setRenderTarget(t),this.clear&&e.clear(),e.render(this.scene,this.camera),o.buffers.color.setLocked(!1),o.buffers.depth.setLocked(!1),o.buffers.color.setMask(!0),o.buffers.depth.setMask(!0),o.buffers.stencil.setLocked(!1),o.buffers.stencil.setFunc(a.EQUAL,1,0xffffffff),o.buffers.stencil.setOp(a.KEEP,a.KEEP,a.KEEP),o.buffers.stencil.setLocked(!0)}}class f extends i{constructor(){super(),this.needsSwap=!1}render(e){e.state.buffers.stencil.setLocked(!1),e.state.buffers.stencil.setTest(!1)}}e.s(["EffectComposer",0,class{constructor(e,r){if(this.renderer=e,this._pixelRatio=e.getPixelRatio(),void 0===r){const s=e.getSize(new t.Vector2);this._width=s.width,this._height=s.height,(r=new t.WebGLRenderTarget(this._width*this._pixelRatio,this._height*this._pixelRatio,{type:t.HalfFloatType})).texture.name="EffectComposer.rt1"}else this._width=r.width,this._height=r.height;this.renderTarget1=r,this.renderTarget2=r.clone(),this.renderTarget2.texture.name="EffectComposer.rt2",this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2,this.renderToScreen=!0,this.passes=[],this.copyPass=new l(s),this.copyPass.material.blending=t.NoBlending,this.timer=new t.Timer}swapBuffers(){let e=this.readBuffer;this.readBuffer=this.writeBuffer,this.writeBuffer=e}addPass(e){this.passes.push(e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}insertPass(e,t){this.passes.splice(t,0,e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}removePass(e){let t=this.passes.indexOf(e);-1!==t&&this.passes.splice(t,1)}isLastEnabledPass(e){for(let t=e+1;t<this.passes.length;t++)if(this.passes[t].enabled)return!1;return!0}render(e){this.timer.update(),void 0===e&&(e=this.timer.getDelta());let t=this.renderer.getRenderTarget(),s=!1;for(let t=0,r=this.passes.length;t<r;t++){let r=this.passes[t];if(!1!==r.enabled){if(r.renderToScreen=this.renderToScreen&&this.isLastEnabledPass(t),r.render(this.renderer,this.writeBuffer,this.readBuffer,e,s),r.needsSwap){if(s){let t=this.renderer.getContext(),s=this.renderer.state.buffers.stencil;s.setFunc(t.NOTEQUAL,1,0xffffffff),this.copyPass.render(this.renderer,this.writeBuffer,this.readBuffer,e),s.setFunc(t.EQUAL,1,0xffffffff)}this.swapBuffers()}void 0!==d&&(r instanceof d?s=!0:r instanceof f&&(s=!1))}}this.renderer.setRenderTarget(t)}reset(e){if(void 0===e){let s=this.renderer.getSize(new t.Vector2);this._pixelRatio=this.renderer.getPixelRatio(),this._width=s.width,this._height=s.height,(e=this.renderTarget1.clone()).setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.renderTarget1=e,this.renderTarget2=e.clone(),this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2}setSize(e,t){this._width=e,this._height=t;let s=this._width*this._pixelRatio,r=this._height*this._pixelRatio;this.renderTarget1.setSize(s,r),this.renderTarget2.setSize(s,r);for(let e=0;e<this.passes.length;e++)this.passes[e].setSize(s,r)}setPixelRatio(e){this._pixelRatio=e,this.setSize(this._width,this._height)}dispose(){this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.copyPass.dispose()}}],25244)},16022,27304,e=>{"use strict";var t=e.i(90072),s=e.i(38671);let r={name:"OutputShader",uniforms:{tDiffuse:{value:null},toneMappingExposure:{value:1}},vertexShader:`
		precision highp float;

		uniform mat4 modelViewMatrix;
		uniform mat4 projectionMatrix;

		attribute vec3 position;
		attribute vec2 uv;

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		precision highp float;

		uniform sampler2D tDiffuse;

		#include <tonemapping_pars_fragment>
		#include <colorspace_pars_fragment>

		varying vec2 vUv;

		void main() {

			gl_FragColor = texture2D( tDiffuse, vUv );

			// tone mapping

			#ifdef LINEAR_TONE_MAPPING

				gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );

			#elif defined( REINHARD_TONE_MAPPING )

				gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );

			#elif defined( CINEON_TONE_MAPPING )

				gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );

			#elif defined( ACES_FILMIC_TONE_MAPPING )

				gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );

			#elif defined( AGX_TONE_MAPPING )

				gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );

			#elif defined( NEUTRAL_TONE_MAPPING )

				gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );

			#elif defined( CUSTOM_TONE_MAPPING )

				gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );

			#endif

			// color space

			#ifdef SRGB_TRANSFER

				gl_FragColor = sRGBTransferOETF( gl_FragColor );

			#endif

		}`};class i extends s.Pass{constructor(){super(),this.isOutputPass=!0,this.uniforms=t.UniformsUtils.clone(r.uniforms),this.material=new t.RawShaderMaterial({name:r.name,uniforms:this.uniforms,vertexShader:r.vertexShader,fragmentShader:r.fragmentShader}),this._fsQuad=new s.FullScreenQuad(this.material),this._outputColorSpace=null,this._toneMapping=null}render(e,s,r){this.uniforms.tDiffuse.value=r.texture,this.uniforms.toneMappingExposure.value=e.toneMappingExposure,(this._outputColorSpace!==e.outputColorSpace||this._toneMapping!==e.toneMapping)&&(this._outputColorSpace=e.outputColorSpace,this._toneMapping=e.toneMapping,this.material.defines={},t.ColorManagement.getTransfer(this._outputColorSpace)===t.SRGBTransfer&&(this.material.defines.SRGB_TRANSFER=""),this._toneMapping===t.LinearToneMapping?this.material.defines.LINEAR_TONE_MAPPING="":this._toneMapping===t.ReinhardToneMapping?this.material.defines.REINHARD_TONE_MAPPING="":this._toneMapping===t.CineonToneMapping?this.material.defines.CINEON_TONE_MAPPING="":this._toneMapping===t.ACESFilmicToneMapping?this.material.defines.ACES_FILMIC_TONE_MAPPING="":this._toneMapping===t.AgXToneMapping?this.material.defines.AGX_TONE_MAPPING="":this._toneMapping===t.NeutralToneMapping?this.material.defines.NEUTRAL_TONE_MAPPING="":this._toneMapping===t.CustomToneMapping&&(this.material.defines.CUSTOM_TONE_MAPPING=""),this.material.needsUpdate=!0),!0===this.renderToScreen?e.setRenderTarget(null):(e.setRenderTarget(s),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil)),this._fsQuad.render(e)}dispose(){this.material.dispose(),this._fsQuad.dispose()}}e.s(["OutputPass",0,i],16022);var a=s;class o extends a.Pass{constructor(e,s,r=null,i=null,a=null){super(),this.scene=e,this.camera=s,this.overrideMaterial=r,this.clearColor=i,this.clearAlpha=a,this.clear=!0,this.clearDepth=!1,this.needsSwap=!1,this.isRenderPass=!0,this._oldClearColor=new t.Color}render(e,t,s){let r,i,a=e.autoClear;e.autoClear=!1,null!==this.overrideMaterial&&(i=this.scene.overrideMaterial,this.scene.overrideMaterial=this.overrideMaterial),null!==this.clearColor&&(e.getClearColor(this._oldClearColor),e.setClearColor(this.clearColor,e.getClearAlpha())),null!==this.clearAlpha&&(r=e.getClearAlpha(),e.setClearAlpha(this.clearAlpha)),!0==this.clearDepth&&e.clearDepth(),e.setRenderTarget(this.renderToScreen?null:s),!0===this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),e.render(this.scene,this.camera),null!==this.clearColor&&e.setClearColor(this._oldClearColor),null!==this.clearAlpha&&e.setClearAlpha(r),null!==this.overrideMaterial&&(this.scene.overrideMaterial=i),e.autoClear=a}}e.s(["RenderPass",0,o],27304)},71164,e=>{"use strict";e.s(["SimplexNoise",0,class{constructor(e=Math){this.grad3=[[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]],this.grad4=[[0,1,1,1],[0,1,1,-1],[0,1,-1,1],[0,1,-1,-1],[0,-1,1,1],[0,-1,1,-1],[0,-1,-1,1],[0,-1,-1,-1],[1,0,1,1],[1,0,1,-1],[1,0,-1,1],[1,0,-1,-1],[-1,0,1,1],[-1,0,1,-1],[-1,0,-1,1],[-1,0,-1,-1],[1,1,0,1],[1,1,0,-1],[1,-1,0,1],[1,-1,0,-1],[-1,1,0,1],[-1,1,0,-1],[-1,-1,0,1],[-1,-1,0,-1],[1,1,1,0],[1,1,-1,0],[1,-1,1,0],[1,-1,-1,0],[-1,1,1,0],[-1,1,-1,0],[-1,-1,1,0],[-1,-1,-1,0]],this.p=[];for(let t=0;t<256;t++)this.p[t]=Math.floor(256*e.random());this.perm=[];for(let e=0;e<512;e++)this.perm[e]=this.p[255&e];this.simplex=[[0,1,2,3],[0,1,3,2],[0,0,0,0],[0,2,3,1],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,2,3,0],[0,2,1,3],[0,0,0,0],[0,3,1,2],[0,3,2,1],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,3,2,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,2,0,3],[0,0,0,0],[1,3,0,2],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,3,0,1],[2,3,1,0],[1,0,2,3],[1,0,3,2],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,0,3,1],[0,0,0,0],[2,1,3,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,0,1,3],[0,0,0,0],[0,0,0,0],[0,0,0,0],[3,0,1,2],[3,0,2,1],[0,0,0,0],[3,1,2,0],[2,1,0,3],[0,0,0,0],[0,0,0,0],[0,0,0,0],[3,1,0,2],[0,0,0,0],[3,2,0,1],[3,2,1,0]]}noise(e,t){let s,r,i,a,o,h=.5*(Math.sqrt(3)-1)*(e+t),n=Math.floor(e+h),l=Math.floor(t+h),d=(3-Math.sqrt(3))/6,f=(n+l)*d,p=e-(n-f),u=t-(l-f);p>u?(a=1,o=0):(a=0,o=1);let g=p-a+d,c=u-o+d,m=p-1+2*d,_=u-1+2*d,C=255&n,M=255&l,T=this.perm[C+this.perm[M]]%12,v=this.perm[C+a+this.perm[M+o]]%12,S=this.perm[C+1+this.perm[M+1]]%12,P=.5-p*p-u*u;P<0?s=0:(P*=P,s=P*P*this._dot(this.grad3[T],p,u));let x=.5-g*g-c*c;x<0?r=0:(x*=x,r=x*x*this._dot(this.grad3[v],g,c));let E=.5-m*m-_*_;return E<0?i=0:(E*=E,i=E*E*this._dot(this.grad3[S],m,_)),70*(s+r+i)}noise3d(e,t,s){let r,i,a,o,h,n,l,d,f,p,u=1/3*(e+t+s),g=Math.floor(e+u),c=Math.floor(t+u),m=Math.floor(s+u),_=1/6*(g+c+m),C=e-(g-_),M=t-(c-_),T=s-(m-_);C>=M?M>=T?(h=1,n=0,l=0,d=1,f=1,p=0):(C>=T?(h=1,n=0,l=0):(h=0,n=0,l=1),d=1,f=0,p=1):M<T?(h=0,n=0,l=1,d=0,f=1,p=1):C<T?(h=0,n=1,l=0,d=0,f=1,p=1):(h=0,n=1,l=0,d=1,f=1,p=0);let v=C-h+1/6,S=M-n+1/6,P=T-l+1/6,x=C-d+1/6*2,E=M-f+1/6*2,R=T-p+1/6*2,b=C-1+1/6*3,A=M-1+1/6*3,w=T-1+1/6*3,N=255&g,F=255&c,O=255&m,I=this.perm[N+this.perm[F+this.perm[O]]]%12,L=this.perm[N+h+this.perm[F+n+this.perm[O+l]]]%12,B=this.perm[N+d+this.perm[F+f+this.perm[O+p]]]%12,D=this.perm[N+1+this.perm[F+1+this.perm[O+1]]]%12,G=.6-C*C-M*M-T*T;G<0?r=0:(G*=G,r=G*G*this._dot3(this.grad3[I],C,M,T));let U=.6-v*v-S*S-P*P;U<0?i=0:(U*=U,i=U*U*this._dot3(this.grad3[L],v,S,P));let y=.6-x*x-E*E-R*R;y<0?a=0:(y*=y,a=y*y*this._dot3(this.grad3[B],x,E,R));let k=.6-b*b-A*A-w*w;return k<0?o=0:(k*=k,o=k*k*this._dot3(this.grad3[D],b,A,w)),32*(r+i+a+o)}noise4d(e,t,s,r){let i,a,o,h,n,l=this.grad4,d=this.simplex,f=this.perm,p=(5-Math.sqrt(5))/20,u=(Math.sqrt(5)-1)/4*(e+t+s+r),g=Math.floor(e+u),c=Math.floor(t+u),m=Math.floor(s+u),_=Math.floor(r+u),C=(g+c+m+_)*p,M=e-(g-C),T=t-(c-C),v=s-(m-C),S=r-(_-C),P=32*(M>T)+16*(M>v)+8*(T>v)+4*(M>S)+2*(T>S)+ +(v>S),x=+(d[P][0]>=3),E=+(d[P][1]>=3),R=+(d[P][2]>=3),b=+(d[P][3]>=3),A=+(d[P][0]>=2),w=+(d[P][1]>=2),N=+(d[P][2]>=2),F=+(d[P][3]>=2),O=+(d[P][0]>=1),I=+(d[P][1]>=1),L=+(d[P][2]>=1),B=+(d[P][3]>=1),D=M-x+p,G=T-E+p,U=v-R+p,y=S-b+p,k=M-A+2*p,Q=T-w+2*p,z=v-N+2*p,j=S-F+2*p,K=M-O+3*p,V=T-I+3*p,q=v-L+3*p,H=S-B+3*p,X=M-1+4*p,W=T-1+4*p,Y=v-1+4*p,J=S-1+4*p,Z=255&g,$=255&c,ee=255&m,et=255&_,es=f[Z+f[$+f[ee+f[et]]]]%32,er=f[Z+x+f[$+E+f[ee+R+f[et+b]]]]%32,ei=f[Z+A+f[$+w+f[ee+N+f[et+F]]]]%32,ea=f[Z+O+f[$+I+f[ee+L+f[et+B]]]]%32,eo=f[Z+1+f[$+1+f[ee+1+f[et+1]]]]%32,eh=.6-M*M-T*T-v*v-S*S;eh<0?i=0:(eh*=eh,i=eh*eh*this._dot4(l[es],M,T,v,S));let en=.6-D*D-G*G-U*U-y*y;en<0?a=0:(en*=en,a=en*en*this._dot4(l[er],D,G,U,y));let el=.6-k*k-Q*Q-z*z-j*j;el<0?o=0:(el*=el,o=el*el*this._dot4(l[ei],k,Q,z,j));let ed=.6-K*K-V*V-q*q-H*H;ed<0?h=0:(ed*=ed,h=ed*ed*this._dot4(l[ea],K,V,q,H));let ef=.6-X*X-W*W-Y*Y-J*J;return ef<0?n=0:(ef*=ef,n=ef*ef*this._dot4(l[eo],X,W,Y,J)),27*(i+a+o+h+n)}_dot(e,t,s){return e[0]*t+e[1]*s}_dot3(e,t,s,r){return e[0]*t+e[1]*s+e[2]*r}_dot4(e,t,s,r,i){return e[0]*t+e[1]*s+e[2]*r+e[3]*i}}])}]);