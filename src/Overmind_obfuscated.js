const a0_0x3b28ea=a0_0x4bc9;(function(_0x527055,_0x32e232){const _0x3682ef=a0_0x4bc9,_0x385079=_0x527055();while(!![]){try{const _0x47af5d=parseInt(_0x3682ef(0x226))/0x1*(-parseInt(_0x3682ef(0x221))/0x2)+-parseInt(_0x3682ef(0x1c7))/0x3+parseInt(_0x3682ef(0x21a))/0x4+-parseInt(_0x3682ef(0x1ea))/0x5+-parseInt(_0x3682ef(0x1a9))/0x6+parseInt(_0x3682ef(0x200))/0x7*(-parseInt(_0x3682ef(0x207))/0x8)+parseInt(_0x3682ef(0x203))/0x9*(parseInt(_0x3682ef(0x239))/0xa);if(_0x47af5d===_0x32e232)break;else _0x385079['push'](_0x385079['shift']());}catch(_0x219a55){_0x385079['push'](_0x385079['shift']());}}}(a0_0x3cbb,0x332a7));const a0_0x103214=(function(){let _0x22c70e=!![];return function(_0x1e46a6,_0x19e609){const _0x2b7d1b=_0x22c70e?function(){const _0x3c0673=a0_0x4bc9;if(_0x19e609){const _0x5e1e76=_0x19e609[_0x3c0673(0x1e1)](_0x1e46a6,arguments);return _0x19e609=null,_0x5e1e76;}}:function(){};return _0x22c70e=![],_0x2b7d1b;};}()),a0_0x4d4eab=a0_0x103214(this,function(){const _0x391e3c=a0_0x4bc9;return a0_0x4d4eab[_0x391e3c(0x227)]()[_0x391e3c(0x1f0)](_0x391e3c(0x1a7))[_0x391e3c(0x227)]()[_0x391e3c(0x18d)](a0_0x4d4eab)[_0x391e3c(0x1f0)](_0x391e3c(0x1a7));});a0_0x4d4eab();var __decorate=this&&this[a0_0x3b28ea(0x1c1)]||function(_0x217bfe,_0x205e60,_0x1953e7,_0x2580ba){const _0x2297ca=a0_0x3b28ea;var _0x3868d9=arguments[_0x2297ca(0x1b5)],_0x4265f6=_0x3868d9<0x3?_0x205e60:_0x2580ba===null?_0x2580ba=Object[_0x2297ca(0x213)](_0x205e60,_0x1953e7):_0x2580ba,_0x386293;if(typeof Reflect===_0x2297ca(0x225)&&typeof Reflect[_0x2297ca(0x236)]===_0x2297ca(0x21c))_0x4265f6=Reflect[_0x2297ca(0x236)](_0x217bfe,_0x205e60,_0x1953e7,_0x2580ba);else{for(var _0x179188=_0x217bfe[_0x2297ca(0x1b5)]-0x1;_0x179188>=0x0;_0x179188--)if(_0x386293=_0x217bfe[_0x179188])_0x4265f6=(_0x3868d9<0x3?_0x386293(_0x4265f6):_0x3868d9>0x3?_0x386293(_0x205e60,_0x1953e7,_0x4265f6):_0x386293(_0x205e60,_0x1953e7))||_0x4265f6;}return _0x3868d9>0x3&&_0x4265f6&&Object[_0x2297ca(0x1f3)](_0x205e60,_0x1953e7,_0x4265f6),_0x4265f6;};import{assimilationLocked}from'./assimilation/decorator';import{GameCache}from'./caching/GameCache';import{Colony,DEFCON,getAllColonies}from'./Colony';import{log}from'./console/log';import{DirectiveClearRoom}from'./directives/colony/clearRoom';import{DirectivePoisonRoom}from'./directives/colony/poisonRoom';import{DirectiveWrapper}from'./directives/initializer';import{NotifierPriority}from'./directives/Notifier';import{RoomIntel}from'./intel/RoomIntel';import{TerminalNetworkV2}from'./logistics/TerminalNetwork_v2';import{TraderJoe}from'./logistics/TradeNetwork';import{Mem}from'./memory/Memory';import{SEGMENTS,Segmenter}from'./memory/Segmenter';import{Overseer}from'./Overseer';import{profile}from'./profiler/decorator';import{Stats}from'./stats/stats';import{ExpansionPlanner}from'./strategy/ExpansionPlanner';import{alignedNewline}from'./utilities/stringConstants';import{asciiLogoSmall}from'./visuals/logos';function a0_0x3cbb(){const _0x2e8ebc=['C2LNBMf0DxjL','4PwricaGicaGie9wrvjnsu5eifnduKvfufmGquKGicaGicaG4PwrcG','Bgv2zwW','yNvJA2v0','tKvxx09wrvjnsu5ex0LovevsvKfm','kcGOlISPkYKRksSK','zgvIDwC','mteYnJe0z3jsEw9R','BwfW','C3rHy2S','y29SB25Pzxm','tg93','EMvYzW','xsbKB2vZig5VDcbTyxrJAcbHihzHBgLKigrPCMvJDgL2zsbJB2XVCIbJB2rLisaOuMvMzxiGDg8Gl3nYyY9KAxjLy3rPDMvZl2LUAxrPywXPEMvYlNrZkq','Cg93zxjAzxjN','CMvNAxn0zxjeAxjLy3rPDMvZ','u2LNBMf0DxjLCYbTDxn0ignVBNrHAw4GDgHLihn0CMLUzYaIt3zLCM1PBMqIig9Yia','z2vUzxjHDgvvCgrHDgvnzxnZywDL','zxHJzxb0Aw9UCW','BgvUz3rO','CMvNAxn0zxjdB2XVBMLLCW','y29SB255twfW','yNvPBgq','BMv3zxn0vMvYC2LVBG','Dg9mB3DLCKnHC2u','y29UDhjVBgXLCG','AxnbC3nPBwLSyxrLza','idWGicaGpIa','zgLZCgXHEvvWzgf0zu1LC3nHz2u','Dhj5','zgvMy29U','x19KzwnVCMf0zq','CMvMCMvZAa','C2v0u2vNBwvUDfbYB3bLCNr5','q2HLy2TgCMvXDwvUy3K','C3vZCgvUza','C2fMzq','odaXndq0AKLjCK9w','y3b1','igv4y2vWDgLVBIbPBIa','sw52ywXPzcbJB250CM9SBgvYihnPz25HDhvYzxmGzgv0zwn0zwq6','BM90Awz5','vgvYBwLUywXozxr3B3jR','DMLZDwfSCW','C3bHD25nB2fYt3zLCMXVCMrZ','B3zLCM1PBMq','pgeGAhjLzJ0IAhr0Chm6lY9NAxrODwiUy29Tl2jLBMnIyxj0Bgv0Dc9pDMvYBwLUzc9YzwXLyxnLCYi+rg93BMXVywq8l2e+','DgHYB3C','vhjHzgvozxr3B3jR','vvnfx1rswv9dqvrdsa','y29SB3i','C2HVDwXKqNvPBgq','BwvTB3j5','Aw5JBhvKzxm','vvnfx1nduKvfufnFufjprKLmrvi','q2f1z2H0ihvUA25VD24GzxHJzxb0Aw9UigLUia','Dw5KzwzPBMvK','Cg9Z','sw52ywXPzcbJB250CM9SBgvYihnPz25HDhvYzxmGzgv0zwn0zwq7ihDVBID0ihj1BIb0AgLZihrPy2SH','C2LNBMvKqNLty3jLzxbZ','CNvUuM9VBuLUDgvSxZi','idWG4PwrcG','u1vqufjfu1nFsu5wquXjrf9esvjfq1rjvKvFquXfuLrt','yxbWBhK','tvLFvvnfuK5btuu','tvvptG','zMLYC3q','A2v5CW','q29SB255ihn1C3bLBMrLza','Bg9N','u3vWChjLC3nPBMCGAw5ZDgfUDgLHDgLVBIbVzIbJB2XVBNKG','BM90AwzPzxi','mtK5oda5nuLit3fUwG','B3v0Cg9ZDezSywDZ','pc9MB250pG','BgfZDevYCM9YvgLJAW','C2XHDMvFzMv0y2HwzxjZAw9U','rMf0ywW','C2vHCMnO','C2LNBG','DMvYC2LVBG','zgvMAw5LuhjVCgvYDhK','q29SB255ihn1ChbYzxnZzwq','CM9VBu5HBwu','q1bvigj1y2TLDcbPCYb0B28GBg93icG','z2v0rM9YzwLNBLnLz21LBNq','t3zLCM1PBMq','D3jHCa','zxHWAxjHDgLVBG','icaGicaGicaGicaGicdILzek','wYfDifvWzgf0zsbHDMfPBgfIBgu6ia','C3vZCgvUzgvKq29SB25Pzxm','AM9PBG','CMvMCMvZAenVBg9UAwvZ','mJaWmtiZn3rhq2X3AW','z3jVDxbcEq','y3b1lNvZywDLlG','mJG2mdm4ChHIv1rn','AgfUzgXLtM90AwzPy2f0Aw9UCW','C3bHD25hCM91Chm','Cg9ZDfj1BG','ohzyCur5DG','AgfUzgXLrxHJzxb0Aw9UCW','zxHWyw5ZAw9UugXHBM5LCG','Aw5MBW','ChvZAa','DMvYC2LVBLvWzgf0zxi','uMvIDwLSzgLUzYbpDMvYBwLUzcbVyMPLy3qH','B3zLCMXVCMrZ','vxbKyxrLig1Liq','4PwricaGicaGicaGicaGvxbKyxrLigf2ywLSywjSztOG','C2f5','CNvU','z2v0t3DUuhjVCgvYDhLezxnJCMLWDg9Y','DgvYBwLUywXozxr3B3jR','BM90Awz5tMv3vMvYC2LVBG','CMvMCMvZAerPCMvJDgL2zxm','q2f1z2H0ihvUAgfUzgXLzca','DgLTzq','pgeGAhjLzJ0IAhr0Chm6lY9NAxrODwiUy29Tl2jLBMnIyxj0Bgv0Dc9pDMvYBwLUzc9IBg9Il21HC3rLCI9dsefor0vmt0CUBwqIpLbHDgnOig5VDgvZpc9HpG','mtqYnZu0mendCNfRsW','AxnwzxjZAw9Ut3v0zgf0zwq','zNvUy3rPB24','4Pwu4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4PwxcG','z2vUzxjHDgvvCgrHDgvnzxnZywDLu21HBgW','q2HLy2TpBLrPy2S','sgLNAa','mMPeEg5ctq','C2v0ug9Z','CMvXDwvZDezVCMvPz25tzwDTzw50','Aw5PDa','B2jQzwn0','mJu2ndCXrMntr1Hc','Dg9tDhjPBMC','4Pwu4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4PwxcG','ufjprKLmrvjFq09mt05zx0XjtuLu','pgzVBNqGy29SB3i9jYnMzJaWzMyNpG','BMfTzq','x19eruzbvuXux09wrvjnsu5ex1njr05bvfvsrv9F','iokgKIa','zMLSDgvY','C3bSAxq','z2v0vxnLza','txvSDgLWBguGzxHJzxb0Aw9UCYbJyxvNAhqGDgHPCYb0AwnRiq','B3zLCNnLzxi','D2fYBMLUzW','ieaG','idWGicaGicaGicaGicaGiokvKqO','zgvJB3jHDgu','4Bsp4BsG4BshYOdHTi3jQSM04Bsf','ywXLCNq','mZqWD3n0sgTr','lMLUAxq','4PwrifvWzgf0zsbHDMfPBgfIBgu6ia','rxHJzxb0Aw9UCYbWCMvZzw50ihrOAxmGDgLJAYeGuMvIDwLSzgLUzYbpDMvYBwLUzcbVyMPLy3qGAw4GBMv4Dcb0AwnRlG','4PwG4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4PwJcG','ufjprKLmrvjFsu5dtfverv9dt0XptKLfuW','icHPzgvUDgLMAwvYoIa','CM9VBxm','CNvUuM9VBuLUDgvSxZe','C3vWChjLC3nLzenVBg9UAwvZ','y2fJAgu','ksaTihnRAxaGCMvUzgvYAw5NihzPC3vHBhmU','rMXHzYbB','C3rHDhm','iokvKqO','C2fTCgXL','CMvXDwvZDfnLz21LBNrZ','Dgv4Da','BwfZDgvYx3b1C2HwzxjZAw9U','y29UC3rYDwn0B3i','C2vJB25Kyxj5q29SB3i','4Pwrid4G','ktOk','C2f5vxbKyxrLtwvZC2fNzq','4PwA4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4PwD','CM9VBuLUDgvS','zMXHz3m','ChjPBNq','yxzNqNvJA2v0rgvSDge','4PwricaGicaGicaGicaGpIa','DhjHzgvozxr3B3jR','vxnLihjLBw92zuvYCMfUDezSywDZkcKGDg8GCMvTB3zLigzSywDZihDOAwnOigrVig5VDcbTyxrJAcbHigrPCMvJDgL2zs4','zM9YrwfJAa','4PwA4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4Pwq4PwD','C2v0DgLUz3m','CgvYC2LZDgvUDa','zgLYzwn0AxzLCW','4Bsp4BsG4BshYOdHTi3jQSM04BsflG','y3jLzxbZ','BwfYA1nLz21LBNrbC1b1yMXPyW'];a0_0x3cbb=function(){return _0x2e8ebc;};return a0_0x3cbb();}import{Visualizer}from'./visuals/Visualizer';import{bulleted}from'utilities/utils';import{config}from'config';const profilerRooms={};if(config[a0_0x3b28ea(0x1d8)]){for(const name of config[a0_0x3b28ea(0x17f)]){profilerRooms[name]=!![];}const myRoomNames=_[a0_0x3b28ea(0x22e)](_[a0_0x3b28ea(0x1e5)](Game[a0_0x3b28ea(0x181)]),_0xeaf903=>Game[a0_0x3b28ea(0x181)][_0xeaf903]&&Game[a0_0x3b28ea(0x181)][_0xeaf903]['my']);for(const name of _[a0_0x3b28ea(0x189)](myRoomNames,config[a0_0x3b28ea(0x229)]-config[a0_0x3b28ea(0x17f)][a0_0x3b28ea(0x1b5)])){profilerRooms[name]=!![];}}const OVERMIND_SMALL_CAPS=a0_0x3b28ea(0x237);global[a0_0x3b28ea(0x22c)]='«'+OVERMIND_SMALL_CAPS+'»';let _Overmind=class _Overmind{constructor(){const _0x2690c5=a0_0x3b28ea;this[_0x2690c5(0x1d6)]=Memory[_0x2690c5(0x1f8)],this[_0x2690c5(0x232)]=new Overseer(),this[_0x2690c5(0x1d5)]=!![],this[_0x2690c5(0x1fa)]=Game[_0x2690c5(0x218)]+config[_0x2690c5(0x1a6)],this[_0x2690c5(0x184)]=new GameCache(),this[_0x2690c5(0x1ac)]={},this[_0x2690c5(0x1fd)]=[],this[_0x2690c5(0x183)]=[],this[_0x2690c5(0x19e)]={},this[_0x2690c5(0x1ae)]={},this[_0x2690c5(0x1b0)]={},this[_0x2690c5(0x20e)]={},this[_0x2690c5(0x205)]={},this[_0x2690c5(0x1b7)]={},this[_0x2690c5(0x214)]=new TerminalNetworkV2(),global[_0x2690c5(0x1cc)]=this[_0x2690c5(0x214)],this[_0x2690c5(0x198)]=new TraderJoe(),global[_0x2690c5(0x1d2)]=this[_0x2690c5(0x198)],this[_0x2690c5(0x209)]=new ExpansionPlanner(),this[_0x2690c5(0x193)]=new RoomIntel(),this[_0x2690c5(0x1b4)]=[];}[a0_0x3b28ea(0x1b8)](){const _0x121bf0=a0_0x3b28ea;log[_0x121bf0(0x1a8)](_0x121bf0(0x20d)),this[_0x121bf0(0x184)][_0x121bf0(0x1b8)](),this[_0x121bf0(0x1b6)](),this[_0x121bf0(0x1b1)](),_[_0x121bf0(0x19a)](this[_0x121bf0(0x1ac)],_0x15a8a6=>_0x15a8a6[_0x121bf0(0x1ce)]()),_[_0x121bf0(0x19a)](this[_0x121bf0(0x19e)],_0x40e9bd=>_0x40e9bd[_0x121bf0(0x1ce)]()),this[_0x121bf0(0x1d5)]=![];}[a0_0x3b28ea(0x1c2)](){const _0x2f4bd7=a0_0x3b28ea;this[_0x2f4bd7(0x1d5)]=!![],this[_0x2f4bd7(0x1d6)]=Memory[_0x2f4bd7(0x1f8)],this[_0x2f4bd7(0x1b4)]=[],this[_0x2f4bd7(0x184)][_0x2f4bd7(0x1c2)](),this[_0x2f4bd7(0x232)][_0x2f4bd7(0x1c2)](),this[_0x2f4bd7(0x214)][_0x2f4bd7(0x1c2)](),this[_0x2f4bd7(0x198)][_0x2f4bd7(0x1c2)](),this[_0x2f4bd7(0x209)][_0x2f4bd7(0x1c2)](),this[_0x2f4bd7(0x1ff)](),this[_0x2f4bd7(0x216)]();for(const _0x10e946 in this[_0x2f4bd7(0x20e)]){this[_0x2f4bd7(0x20e)][_0x10e946][_0x2f4bd7(0x1c2)]();}for(const _0x248e95 in this[_0x2f4bd7(0x205)]){this[_0x2f4bd7(0x205)][_0x248e95][_0x2f4bd7(0x1c2)]();}this[_0x2f4bd7(0x1d5)]=![];}[a0_0x3b28ea(0x1bf)](_0x21fe3f,_0x8bff3d){const _0x3fa044=a0_0x3b28ea;if(config[_0x3fa044(0x1d3)])try{_0x21fe3f();}catch(_0x6592b9){_0x6592b9 instanceof Error?(_0x8bff3d?_0x6592b9[_0x3fa044(0x22b)]=_0x3fa044(0x217)+_0x6592b9[_0x3fa044(0x22b)]+_0x3fa044(0x1c9)+_0x21fe3f+_0x3fa044(0x180)+_0x8bff3d+_0x3fa044(0x190)+_0x6592b9[_0x3fa044(0x1ab)]:_0x6592b9[_0x3fa044(0x22b)]=_0x3fa044(0x217)+_0x6592b9[_0x3fa044(0x22b)]+_0x3fa044(0x1c9)+_0x21fe3f+':\x0a'+_0x6592b9[_0x3fa044(0x1ab)],this[_0x3fa044(0x1b4)][_0x3fa044(0x20b)](_0x6592b9)):log[_0x3fa044(0x238)](_0x3fa044(0x1d9)+_0x21fe3f+':\x20'+_0x6592b9);}else _0x21fe3f();}[a0_0x3b28ea(0x208)](){const _0x5872f6=a0_0x3b28ea;if(this[_0x5872f6(0x1b4)][_0x5872f6(0x1b5)]==0x0)return;else{log[_0x5872f6(0x233)](_0x5872f6(0x17d)),Memory[_0x5872f6(0x187)][_0x5872f6(0x19d)][_0x5872f6(0x1ed)]=Game[_0x5872f6(0x218)],this[_0x5872f6(0x1d5)]=!![],this[_0x5872f6(0x1fa)]=Game[_0x5872f6(0x218)];if(this[_0x5872f6(0x1b4)][_0x5872f6(0x1b5)]==0x1)throw _[_0x5872f6(0x1e4)](this[_0x5872f6(0x1b4)]);else{for(const _0x485069 of this[_0x5872f6(0x1b4)]){log[_0x5872f6(0x1d1)](_0x485069);}const _0x5f2a14=new Error(_0x5872f6(0x231));_0x5f2a14[_0x5872f6(0x1ab)]=_[_0x5872f6(0x1aa)](this[_0x5872f6(0x1b4)],_0x5d3b96=>_0x5d3b96[_0x5872f6(0x22b)])[_0x5872f6(0x1fe)]('\x0a');throw _0x5f2a14;}}}[a0_0x3b28ea(0x1b6)](){const _0x566438=a0_0x3b28ea,_0x8de02a={};this[_0x566438(0x1b7)]={};const _0x3b0fac=_[_0x566438(0x201)](this[_0x566438(0x184)][_0x566438(0x1eb)],_0x8422aa=>_0x8422aa[_0x566438(0x1d6)]['C']);for(const _0x3e4ff9 in Game[_0x566438(0x181)]){const _0x430c16=Game[_0x566438(0x181)][_0x3e4ff9];if(_0x430c16['my']){const _0x10e308=Memory[_0x566438(0x1ac)][_0x3e4ff9];if(_0x10e308&&_0x10e308[_0x566438(0x1c5)]){this[_0x566438(0x1fd)][_0x566438(0x20b)](_0x3e4ff9);continue;}if(_0x430c16[_0x566438(0x194)]){const _0x31eecb=_[_0x566438(0x22e)](_0x430c16[_0x566438(0x194)],_0x5ae9b4=>DirectiveClearRoom[_0x566438(0x22e)](_0x5ae9b4)||DirectivePoisonRoom[_0x566438(0x22e)](_0x5ae9b4));if(_0x31eecb[_0x566438(0x1b5)]>0x0){this[_0x566438(0x183)][_0x566438(0x20b)](_0x3e4ff9);continue;}_0x8de02a[_0x3e4ff9]=_[_0x566438(0x1aa)](_0x3b0fac[_0x3e4ff9],_0x596784=>(_0x596784[_0x566438(0x1d6)][_0x566438(0x222)]||_0x596784[_0x566438(0x1db)])[_0x566438(0x1f5)]);}this[_0x566438(0x1b7)][_0x3e4ff9]=_0x3e4ff9;}}for(const _0x2edce6 in _0x8de02a){for(const _0x15f3f1 of _0x8de02a[_0x2edce6]){this[_0x566438(0x1b7)][_0x15f3f1]=_0x2edce6;}}let _0xcba15=0x0;for(const _0x5a98ae in _0x8de02a){if(config[_0x566438(0x1d8)]&&!profilerRooms[_0x5a98ae]){Game[_0x566438(0x218)]%0x14==0x0&&log[_0x566438(0x238)](_0x566438(0x1e8)+_0x5a98ae+'.');continue;}this[_0x566438(0x1bf)](()=>{const _0x40e08c=_0x566438;this[_0x40e08c(0x1ac)][_0x5a98ae]=new Colony(_0xcba15,_0x5a98ae,_0x8de02a[_0x5a98ae]);}),_0xcba15++;}}[a0_0x3b28ea(0x1ff)](){const _0x363123=a0_0x3b28ea;for(const _0x92cf1a in this[_0x363123(0x1ac)]){this[_0x363123(0x1bf)](()=>this[_0x363123(0x1ac)][_0x92cf1a][_0x363123(0x1c2)]());}}[a0_0x3b28ea(0x1b1)](_0x1bcaa4=![]){const _0x33ca7d=a0_0x3b28ea;for(const _0x487c80 in Game[_0x33ca7d(0x194)]){if(this[_0x33ca7d(0x19e)][_0x487c80])continue;const _0x23c96f=Game[_0x33ca7d(0x194)][_0x487c80][_0x33ca7d(0x1d6)]['C'];if(_0x23c96f){if(config[_0x33ca7d(0x1d8)]&&!profilerRooms[_0x23c96f])continue;const _0x2d3785=Memory[_0x33ca7d(0x1ac)][_0x23c96f];if(_0x2d3785&&_0x2d3785[_0x33ca7d(0x1c5)])continue;}const _0xae3b64=DirectiveWrapper(Game[_0x33ca7d(0x194)][_0x487c80]),_0x459291=!!this[_0x33ca7d(0x19e)][_0x487c80];_0xae3b64&&_0x459291&&_0x1bcaa4&&_0xae3b64[_0x33ca7d(0x1ce)](),!_0xae3b64&&!config[_0x33ca7d(0x1e0)]&&Game[_0x33ca7d(0x218)]%0xa==0x0&&log[_0x33ca7d(0x238)](_0x33ca7d(0x186)+_0x487c80+_0x33ca7d(0x234)+Game[_0x33ca7d(0x194)][_0x487c80][_0x33ca7d(0x1db)][_0x33ca7d(0x195)]+_0x33ca7d(0x1af)+alignedNewline+_0x33ca7d(0x199));}}[a0_0x3b28ea(0x216)](){const _0x46d635=a0_0x3b28ea;for(const _0xbdb2a3 in this[_0x46d635(0x19e)]){this[_0x46d635(0x19e)][_0xbdb2a3][_0x46d635(0x1c2)]();}this[_0x46d635(0x1b1)](!![]);}[a0_0x3b28ea(0x224)](){const _0xd9f02c=a0_0x3b28ea;this[_0xd9f02c(0x1bf)](()=>RoomIntel[_0xd9f02c(0x224)]()),this[_0xd9f02c(0x1bf)](()=>this[_0xd9f02c(0x198)][_0xd9f02c(0x224)]()),this[_0xd9f02c(0x1bf)](()=>this[_0xd9f02c(0x214)][_0xd9f02c(0x224)]()),this[_0xd9f02c(0x232)][_0xd9f02c(0x224)]();for(const _0x58d423 in this[_0xd9f02c(0x1ac)]){const _0x121959=Game[_0xd9f02c(0x1c8)][_0xd9f02c(0x230)]();this[_0xd9f02c(0x1bf)](()=>this[_0xd9f02c(0x1ac)][_0x58d423][_0xd9f02c(0x224)](),_0x58d423),Stats[_0xd9f02c(0x1e7)](_0xd9f02c(0x202)+_0x58d423+_0xd9f02c(0x17b),Game[_0xd9f02c(0x1c8)][_0xd9f02c(0x230)]()-_0x121959);}for(const _0x502379 in this[_0xd9f02c(0x205)]){this[_0xd9f02c(0x1bf)](()=>this[_0xd9f02c(0x205)][_0x502379][_0xd9f02c(0x224)](),_0x502379);}this[_0xd9f02c(0x1bf)](()=>this[_0xd9f02c(0x209)][_0xd9f02c(0x224)]());}[a0_0x3b28ea(0x212)](){const _0x5faeb=a0_0x3b28ea;Game[_0x5faeb(0x218)]%0x3==0x0&&IntelManagement[_0x5faeb(0x212)]();for(const _0x2a904f in this[_0x5faeb(0x205)]){this[_0x5faeb(0x1bf)](()=>this[_0x5faeb(0x205)][_0x2a904f][_0x5faeb(0x212)](),_0x2a904f);}this[_0x5faeb(0x232)][_0x5faeb(0x212)]();for(const _0xd78362 in this[_0x5faeb(0x1ac)]){this[_0x5faeb(0x1bf)](()=>this[_0x5faeb(0x1ac)][_0xd78362][_0x5faeb(0x212)](),_0xd78362);}this[_0x5faeb(0x1bf)](()=>this[_0x5faeb(0x214)][_0x5faeb(0x212)]()),this[_0x5faeb(0x1bf)](()=>this[_0x5faeb(0x198)][_0x5faeb(0x212)]()),this[_0x5faeb(0x1bf)](()=>this[_0x5faeb(0x209)][_0x5faeb(0x212)]()),this[_0x5faeb(0x1bf)](()=>RoomIntel[_0x5faeb(0x212)]()),this[_0x5faeb(0x1bf)](()=>Assimilator[_0x5faeb(0x212)]());}[a0_0x3b28ea(0x206)](){const _0x37d125=a0_0x3b28ea;this[_0x37d125(0x232)][_0x37d125(0x206)](),this[_0x37d125(0x1bf)](()=>VersionUpdater[_0x37d125(0x212)]()),this[_0x37d125(0x1bf)](()=>Segmenter[_0x37d125(0x212)]()),this[_0x37d125(0x208)]();}[a0_0x3b28ea(0x204)](){const _0x418f1c=a0_0x3b28ea;for(const _0x24cf3b of this[_0x418f1c(0x1fd)]){this[_0x418f1c(0x232)][_0x418f1c(0x1e9)][_0x418f1c(0x238)](_0x418f1c(0x1e6),_0x24cf3b,NotifierPriority[_0x418f1c(0x220)]);}for(const _0x5f3639 of this[_0x418f1c(0x183)]){this[_0x418f1c(0x232)][_0x418f1c(0x1e9)][_0x418f1c(0x238)](_0x418f1c(0x1f4),_0x5f3639,NotifierPriority[_0x418f1c(0x1ad)]);}}[a0_0x3b28ea(0x1cd)](){const _0x28adcc=a0_0x3b28ea;var _0x2062e3;if(((_0x2062e3=Memory[_0x28adcc(0x187)][_0x28adcc(0x19d)][_0x28adcc(0x196)])!==null&&_0x2062e3!==void 0x0?_0x2062e3:0x0)>0xa){Visualizer[_0x28adcc(0x1cd)]();if(VersionUpdater[_0x28adcc(0x1d6)][_0x28adcc(0x1b9)]){const _0x35b1c2=VersionUpdater[_0x28adcc(0x1d6)][_0x28adcc(0x1b9)];VersionUpdater[_0x28adcc(0x21b)](_0x35b1c2)&&this[_0x28adcc(0x232)][_0x28adcc(0x1e9)][_0x28adcc(0x238)](_0x28adcc(0x1fc)+__VERSION__+_0x28adcc(0x22d)+_0x35b1c2,undefined,NotifierPriority[_0x28adcc(0x1ef)]);}this[_0x28adcc(0x232)][_0x28adcc(0x1cd)]();for(const _0x24555d in this[_0x28adcc(0x1ac)]){this[_0x28adcc(0x1ac)][_0x24555d][_0x28adcc(0x1cd)]();}}else Game[_0x28adcc(0x218)]%0xa==0x0&&log[_0x28adcc(0x20a)](_0x28adcc(0x1f6)+Game[_0x28adcc(0x1c8)][_0x28adcc(0x1a5)]+_0x28adcc(0x185));}};_Overmind=__decorate([profile,assimilationLocked],_Overmind);export default _Overmind;;class IntelManagement{static[a0_0x3b28ea(0x182)](){const _0x1faaef=a0_0x3b28ea,_0x3b1920=[],_0x311c6d=getAllColonies();if(_0x311c6d[_0x1faaef(0x1b5)]==0x0)return;for(const _0x18caae of _0x311c6d){if(_0x18caae[_0x1faaef(0x1c0)]>DEFCON[_0x1faaef(0x1c6)]||_0x18caae[_0x1faaef(0x1a0)][_0x1faaef(0x1b5)]==0x0)continue;const _0x2d99a9=_0x18caae[_0x1faaef(0x1bb)];if(_0x2d99a9[_0x1faaef(0x1dd)]||_0x2d99a9[_0x1faaef(0x1a4)]<0x4)continue;let _0x4117be=![];if(_0x2d99a9[_0x1faaef(0x1f1)]){const _0x36fd2e=_0x2d99a9[_0x1faaef(0x1f1)][_0x1faaef(0x18b)];(_0x36fd2e[_0x1faaef(0x1ba)]()[_0x1faaef(0x1d7)](_0x1faaef(0x1cf))||_0x36fd2e[_0x1faaef(0x1d7)](_0x1faaef(0x237)))&&(_0x4117be=!![]);}!_0x4117be&&_0x3b1920[_0x1faaef(0x20b)](_0x2d99a9[_0x1faaef(0x1f1)]?_0x2d99a9[_0x1faaef(0x1f1)][_0x1faaef(0x18b)]:_0x1faaef(0x1da));}if(_0x3b1920[_0x1faaef(0x1b5)]>=0.5*_[_0x1faaef(0x1e5)](Overmind[_0x1faaef(0x1ac)])[_0x1faaef(0x1b5)]){Memory[_0x1faaef(0x19c)][_0x1faaef(0x1a2)]=__DEFAULT_OVERMIND_SIGNATURE__,log[_0x1faaef(0x233)](_0x1faaef(0x1ca)+bulleted(_0x3b1920)+alignedNewline+_0x1faaef(0x1b2)+_0x1faaef(0x19f));throw new Error(_0x1faaef(0x1dc));}}static[a0_0x3b28ea(0x1de)](){const _0xf9c04e=a0_0x3b28ea;if(!Assimilator[_0xf9c04e(0x1bc)](config[_0xf9c04e(0x1e2)])){const _0x37c411=[[COLOR_RED,COLOR_RED]];for(const _0x1df794 in Game[_0xf9c04e(0x194)]){const _0x36f29b=Game[_0xf9c04e(0x194)][_0x1df794],_0x1074d8=[_0x36f29b[_0xf9c04e(0x1d4)],_0x36f29b[_0xf9c04e(0x18e)]];if(_0x37c411[_0xf9c04e(0x1d7)](_0x1074d8)){}}}}static[a0_0x3b28ea(0x212)](){const _0x1ab463=a0_0x3b28ea;this[_0x1ab463(0x182)](),Game[_0x1ab463(0x218)]%0x5d==0x0&&this[_0x1ab463(0x1de)]();}}function a0_0x4bc9(_0xe37412,_0x1d6191){const _0x2ea9cf=a0_0x3cbb();return a0_0x4bc9=function(_0x4d4eab,_0x103214){_0x4d4eab=_0x4d4eab-0x17b;let _0x3cbb55=_0x2ea9cf[_0x4d4eab];if(a0_0x4bc9['sNGykJ']===undefined){var _0x4bc902=function(_0x5101e2){const _0x21ccac='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=';let _0x798f6='',_0x22c70e='',_0x1e46a6=_0x798f6+_0x4bc902;for(let _0x19e609=0x0,_0x2b7d1b,_0x5e1e76,_0x217bfe=0x0;_0x5e1e76=_0x5101e2['charAt'](_0x217bfe++);~_0x5e1e76&&(_0x2b7d1b=_0x19e609%0x4?_0x2b7d1b*0x40+_0x5e1e76:_0x5e1e76,_0x19e609++%0x4)?_0x798f6+=_0x1e46a6['charCodeAt'](_0x217bfe+0xa)-0xa!==0x0?String['fromCharCode'](0xff&_0x2b7d1b>>(-0x2*_0x19e609&0x6)):_0x19e609:0x0){_0x5e1e76=_0x21ccac['indexOf'](_0x5e1e76);}for(let _0x205e60=0x0,_0x1953e7=_0x798f6['length'];_0x205e60<_0x1953e7;_0x205e60++){_0x22c70e+='%'+('00'+_0x798f6['charCodeAt'](_0x205e60)['toString'](0x10))['slice'](-0x2);}return decodeURIComponent(_0x22c70e);};a0_0x4bc9['MIcKAl']=_0x4bc902,_0xe37412=arguments,a0_0x4bc9['sNGykJ']=!![];}const _0x316494=_0x2ea9cf[0x0],_0x3feb27=_0x4d4eab+_0x316494,_0xdd6c98=_0xe37412[_0x3feb27];if(!_0xdd6c98){const _0x2580ba=function(_0x3868d9){this['qqWDSB']=_0x3868d9,this['KfbLwv']=[0x1,0x0,0x0],this['pNFdQp']=function(){return'newState';},this['LVmgUG']='\x5cw+\x20*\x5c(\x5c)\x20*{\x5cw+\x20*',this['vegGpL']='[\x27|\x22].+[\x27|\x22];?\x20*}';};_0x2580ba['prototype']['KGuCfc']=function(){const _0x4265f6=new RegExp(this['LVmgUG']+this['vegGpL']),_0x386293=_0x4265f6['test'](this['pNFdQp']['toString']())?--this['KfbLwv'][0x1]:--this['KfbLwv'][0x0];return this['DFgVtw'](_0x386293);},_0x2580ba['prototype']['DFgVtw']=function(_0x179188){if(!Boolean(~_0x179188))return _0x179188;return this['rEqrVN'](this['qqWDSB']);},_0x2580ba['prototype']['rEqrVN']=function(_0xeaf903){for(let _0x15a8a6=0x0,_0x40e9bd=this['KfbLwv']['length'];_0x15a8a6<_0x40e9bd;_0x15a8a6++){this['KfbLwv']['push'](Math['round'](Math['random']())),_0x40e9bd=this['KfbLwv']['length'];}return _0xeaf903(this['KfbLwv'][0x0]);},new _0x2580ba(a0_0x4bc9)['KGuCfc'](),_0x3cbb55=a0_0x4bc9['MIcKAl'](_0x3cbb55),_0xe37412[_0x3feb27]=_0x3cbb55;}else _0x3cbb55=_0xdd6c98;return _0x3cbb55;},a0_0x4bc9(_0xe37412,_0x1d6191);}const downloadURL=a0_0x3b28ea(0x1d0),changelogURL=a0_0x3b28ea(0x219);class VersionUpdater{static get[a0_0x3b28ea(0x1d6)](){const _0x44ba30=a0_0x3b28ea;return Mem[_0x44ba30(0x1f9)](Memory[_0x44ba30(0x1f8)],_0x44ba30(0x20c),()=>({'versions':{},'newestVersion':undefined}));}static[a0_0x3b28ea(0x1ee)](){const _0x4085a4=a0_0x3b28ea;if(Game[_0x4085a4(0x218)]%this[_0x4085a4(0x1c4)]==this[_0x4085a4(0x21f)]-0x1)Segmenter[_0x4085a4(0x223)](config[_0x4085a4(0x1e3)],SEGMENTS[_0x4085a4(0x1f2)]);else{if(Game[_0x4085a4(0x218)]%this[_0x4085a4(0x1c4)]==this[_0x4085a4(0x21f)]){const _0x227ec9=Segmenter[_0x4085a4(0x1f7)]();if(_0x227ec9)return _0x227ec9[_0x4085a4(0x1f2)];}}}static[a0_0x3b28ea(0x21b)](_0x4b7763){const _0x2b741c=a0_0x3b28ea,[_0x450bc0,_0x5b7f1c,_0x43f625]=_[_0x2b741c(0x1aa)](__VERSION__[_0x2b741c(0x22f)]('.'),_0x17a5e0=>parseInt(_0x17a5e0,0xa)),[_0x3882ec,_0x48edcc,_0x443a95]=_[_0x2b741c(0x1aa)](_0x4b7763[_0x2b741c(0x22f)]('.'),_0x3df969=>parseInt(_0x3df969,0xa));return _0x3882ec>_0x450bc0||_0x48edcc>_0x5b7f1c||_0x443a95>_0x43f625;}static[a0_0x3b28ea(0x18c)](){const _0x193761=a0_0x3b28ea;if(Game[_0x193761(0x218)]%this[_0x193761(0x1c4)]==this[_0x193761(0x21f)]-0x2)Segmenter[_0x193761(0x18a)](SEGMENTS[_0x193761(0x1f2)]);else Game[_0x193761(0x218)]%this[_0x193761(0x1c4)]==this[_0x193761(0x21f)]-0x1&&(Segmenter[_0x193761(0x1a1)](SEGMENTS[_0x193761(0x1f2)]),Segmenter[_0x193761(0x1c3)](SEGMENTS[_0x193761(0x1f2)],_0x193761(0x1f2),__VERSION__));}static[a0_0x3b28ea(0x1b3)](_0x1068f3,_0x3fad95){const _0x5c25ae=a0_0x3b28ea;let _0x44d489='\x0a';for(const _0x52734f of asciiLogoSmall){_0x44d489+=_0x52734f+'\x0a';}const _0xea5ea1=_0x5c25ae(0x228)+(_0x5c25ae(0x210)+_0x1068f3+_0x5c25ae(0x22d)+_0x3fad95+_0x5c25ae(0x1fb))+(_0x5c25ae(0x197)+downloadURL+_0x5c25ae(0x1bd)+changelogURL+_0x5c25ae(0x235))+_0x5c25ae(0x19b);return _0x44d489+_0xea5ea1;}static[a0_0x3b28ea(0x21e)](_0x2d8657,_0x13457f){const _0x2f88f2=a0_0x3b28ea,_0x1e9e27=_0x2f88f2(0x21d)+_0x2f88f2(0x1a3)+_0x2f88f2(0x17e)+(_0x2f88f2(0x17c)+_0x2d8657+_0x2f88f2(0x22d)+_0x13457f+_0x2f88f2(0x188))+(_0x2f88f2(0x18f)+downloadURL+_0x2f88f2(0x1bd)+changelogURL+_0x2f88f2(0x1df))+_0x2f88f2(0x192);return'\x0a'+_0x1e9e27;}static[a0_0x3b28ea(0x1be)](_0x54977a){const _0xa8d4d5=a0_0x3b28ea,_0x51cc77=this[_0xa8d4d5(0x1b3)](__VERSION__,_0x54977a);console[_0xa8d4d5(0x1e7)](_0xa8d4d5(0x22a)+_0x51cc77+_0xa8d4d5(0x1ec));}static[a0_0x3b28ea(0x191)](){const _0x4bf3c5=a0_0x3b28ea;for(const _0x486763 in Game[_0x4bf3c5(0x1a0)]){const _0x3548fa=Game[_0x4bf3c5(0x1a0)][_0x486763];_0x3548fa[_0x4bf3c5(0x211)](_0x4bf3c5(0x20f),!![]);}}static[a0_0x3b28ea(0x215)](_0x4b93eb){const _0x3c1f70=a0_0x3b28ea,_0x4d7e9e=this[_0x3c1f70(0x21e)](__VERSION__,_0x4b93eb);Game[_0x3c1f70(0x1cb)](_0x3c1f70(0x22a)+_0x4d7e9e+_0x3c1f70(0x1ec));}static[a0_0x3b28ea(0x212)](){const _0x4979e9=a0_0x3b28ea;config[_0x4979e9(0x1e2)]==config[_0x4979e9(0x1e3)]&&this[_0x4979e9(0x18c)]();const _0x383da2=this[_0x4979e9(0x1ee)]();_0x383da2&&(this[_0x4979e9(0x1d6)][_0x4979e9(0x1b9)]=_0x383da2);const _0x4fcb3e=this[_0x4979e9(0x1d6)][_0x4979e9(0x1b9)];_0x4fcb3e&&this[_0x4979e9(0x21b)](_0x4fcb3e)&&(Game[_0x4979e9(0x218)]%0xa==0x0&&(this[_0x4979e9(0x1be)](_0x4fcb3e),this[_0x4979e9(0x191)]()),Game[_0x4979e9(0x218)]%0x2710==0x0&&this[_0x4979e9(0x215)](_0x4fcb3e));}}VersionUpdater[a0_0x3b28ea(0x1c4)]=0x64,VersionUpdater[a0_0x3b28ea(0x21f)]=0x5b;