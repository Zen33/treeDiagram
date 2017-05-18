(function (global) {
    // Snapshot tree grpah proto 0.1 By tangzhen@inspur.com
    'use strict';
    /* 可配项 Begin */
    var id = 'snapshotTreeGraph';
    var margin = {
        top: -40,
        right: 120,
        bottom: 20,
        left: 120
    };
    var loader = 'img/spinner.gif';
    var menuContent =
        // '<ul><li rel="create">生成快照</li><li rel="list">列表视图</li><li rel="tree">树视图</li><li class="more" rel="restore">还原到快照...</li><li class="more" rel="new">从快照新建VM</li><li class="more" rel="save">另存为模板...</li><li class="more" rel="remove">删除</li></ul>';
        '<ul><li rel="create">生成快照</li><li class="more" rel="restore">还原到快照...</li><li class="more" rel="remove">删除</li></ul>';
    var icon = {
        width: 42,
        height: 42,
        type: {
            root: 'img/1.png', // 宿主
            replica: 'img/2.png', // 副本
            now: 'img/0.png' // 当前
        }
    };
    var containerId = 'container';
    var fontSize = '12px';
    var width = ($('#' + containerId).width() || 1024) - margin.right - margin.left;
    var height = ($('#' + containerId).height() || 768) - margin.top - margin.bottom;
    var nodes = []; // 当前节点集合
    var duration = 750;
    var maxCount = 10; // 最大节点数（null为无限多）
    var timer = 1000;
    /* 可配项 End */
    var isLocking = false; // 进程锁
    var gaps = []; // 间隔
    var datum; // 原始数据
    var tree = d3.layout.tree().size([width, height]);
    var tmpNodes;
    var svg;
    var colors = d3.scale.category20();
    var curNode; // 当前选中的节点
    var $svg; // 画布
    var soul; // 当前快照所在节点
    var aList = []; // 优先级
    var curPos = [0, 0]; // 当前位置
    var curZoom = 1; // 当前缩放值
    var zoomRange = [0.5, 2]; // 缩放范围
    var zoom = d3.behavior.zoom().scaleExtent(zoomRange).on('zoom', setZoom);
    var curMouseBtn;
    var rootName = '';
    var data;
    var lastTime = new Date().getTime();

    function getTime() { // 获取当前时间
        var format = d3.time.format('%Y-%m-%d %H:%M:%S');
        return format(new Date());
    }

    function initData(val) { // 初始化数据
        data = [{
            name: rootName,
            type: 'root',
            hint: '基础',
            children: [{
                name: val,
                type: 'replica',
                hint: getTime(),
                children: [{
                    name: '当前',
                    type: 'now'
                }]
            }]
        }];
        return getStarted(data);
    }

    function setZoom(scale) { // 设置缩放/移动
        // if (d3.event && d3.event.sourceEvent) {
        //     if (d3.event.sourceEvent.which === 3) { // 右键不移动 // firefox无效
        //         zoom.translate(curPos);
        //         return;
        //     }
        // }
        // Todo boundary
        if (curMouseBtn === 2) {
            zoom.translate(curPos);
            return;
        }
        if (d3.event && d3.event.translate) {
            curPos = d3.event.translate;
        }
        if (d3.event && d3.event.scale) {
            curZoom = d3.event.scale;
        }
        if (scale >= zoomRange[0] && scale <= zoomRange[1]) {
            curZoom = scale;
            zoom.scale(curZoom);
        }
        svg.attr('transform', 'translate(' + curPos + ')scale(' + curZoom + ')');
    }

    function saveData() {
        // 模拟记录
        lsTest() && (localStorage['ICSTreeGraphData'] = JSON.stringify(JSON.decycle(data)));
    }

    function getStarted(data) { // 开启
        var defs;
        saveData();
        datum = $.extend([], data);
        data = data[0];
        tmpNodes = tree.nodes(data);
        if (!$('svg#' + id).length) {
            svg = d3.select('#' + containerId).append('svg').attr({
                id: id,
                width: width + margin.right + margin.left,
                height: height + margin.top + margin.bottom,
            }).append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
            $svg = $('svg#' + id);
            defs = svg.append('svg:defs');
            Object.keys(icon.type).forEach(function (item, index) {
                defs.append('svg:marker').attr({
                    id: 'arrow' + item,
                    viewBox: '0 -5 10 10',
                    refX: 0,
                    refY: 0,
                    markerWidth: 5,
                    markerHeight: 5,
                    orient: 'auto'
                }).append('svg:path').attr('d', 'M0,-5L10,0L0,5');
            });
            d3.select('body').append('div').attr({
                id: id + 'Menu',
                class: 'node-menu'
            }).html(menuContent).style('display', 'none');
            $('#' + id + 'Menu li').click(function () {
                var type = this.getAttribute('rel');
                global.treeGraph[type] && global.treeGraph[type]();
                $('#' + id + 'Menu').hide();
            });
            d3.select('svg#' + id).on('mousedown', function () {
                curMouseBtn = d3.event.button;
                if (d3.event.target === document.querySelector('#' + id)) {
                    unselectNode();
                }
            }).call(zoom);
            svg.append('svg:rect').attr({
                id: 'highlight',
                width: icon.width + 10,
                height: icon.height + 10,
                // fill: colors.range()[Math.floor(Math.random() * 100 % 20)], // '#007daa', '#98df8a', '#1f77b4'
                fill: '#c2d6e8',
                rx: 10,
                transform: 'translate(' + (width - icon.width) / 2 + ',' + (height - icon.height) / 2 + ')',
                'fill-opacity': 1e-6
            });
        }
        gaps.push(icon.width);
        data.id = data.id || getSeed();
        data.y = getNodeY(data.id);
        data.x = 0;
        data.level = '0';
        data.depth = parseInt(data.level);
        nodes.push(data);
        prepareNodes(data.children);
        updateNodesXOffset();
        setAList(soul, [data]);
        render(data, nodes);
        d3.select(self.frameElement).style('height', height + 'px');
    }

    function insertLinebreaks(d, prop) { // 换行
        var element = d3.select(this);
        var prop = prop || 'hint';
        // var words = d['hint'] && d['hint'].split(' ') || [];
        var words = d['hint'] && d['hint'].toString().match(/.{1,10}/g) || [d['hint']]; // 根据场景每10个字节换行
        var i = 0;
        var len = words.length;
        var tspan;
        if (!len) {
            return;
        }
        element.text('');
        for (; i < len; i += 1) {
            element.append('tspan').text(words[i]).attr({
                x: icon.width,
                dy: i ? '1.2em' : icon.height * 1.2,
                'text-anchor': 'middle',
                class: 'node-tspan'
            }).style('font-size', fontSize);
        }
    }

    function render(source, nodes, callback) { // 渲染节点
        var node;
        var nodeEnter;
        var nodeUpdate;
        var nodeExit;

        nodes.forEach(function (node, index) {
            var links = [];
            var link;
            if (node.children) {
                node.x0 = node.x;
                node.x += icon.width * 1.7;
                node.children.forEach(function (child) {
                    links.push({
                        source: node,
                        target: child
                    });
                });
            }
            link = svg.selectAll('path.link-index-' + index).data(links, function (d) {
                return d.target.id;
            });
            link.enter().insert('svg:path', 'g').attr({
                d: function (d) {
                    var pos = {
                        // x: d.source.x0 + icon.width / 2,
                        x: d.source.x0,
                        y: d.source.y
                    }
                    return customSpline({
                        source: pos,
                        target: pos
                    });
                }
            }).style('opacity', 1e-6);
            link.transition().duration((duration)).attr({
                'marker-end': function (d) {
                    return 'url(#arrow' + (d.target['a-list'] === 1 ? 'root' :
                        'replica') + ')';
                },
                class: function (d) {
                    return 'link link-index-' + index + ' link-' + (d.target['a-list'] === 1 ? 'root' : 'replica') + ' link-' + d.target.id;
                },
                d: customSpline
            }).style('opacity', 1);
            link.exit().transition().duration(duration).attr('d', function (d) {
                var pos = {
                    x: d.source.x,
                    y: d.source.y
                };
                return customSpline({
                    source: pos,
                    target: pos
                });
            }).style('opacity', 1e-6).remove();
        });
        node = svg.selectAll('g.node').data(nodes, function (d) {
            return d.hasOwnProperty('id') ? d.id : (d.id = getSeed());
        });
        nodeEnter = node.enter().append('g').attr({
            class: function (d) {
                return 'node node-' + d.id;
            },
            // transform: 'translate(' + source.x0 + ',' + source.y + ')'
            transform: function (d) {
                return 'translate(' + (d.x0 - icon.width * 2) + ',' + d.y + ')';
            }
        }).style('opacity', 1e-6);
        nodeEnter.append('image').attr({
            x: icon.height / 2,
            y: -icon.height / 2,
            width: icon.width,
            height: icon.height,
            class: function (d) {
                return 'node-icon node-icon-' + d.type + ' node-icon-' + d.id;
            },
            'xlink:href': function (d) {
                return icon['type'][d.type];
            }
        }).on('click', function (d) {
            selectNode(d);
        }).on('contextmenu', contextMenu);
        nodeEnter.append('title').text(function (d) {
            return d.name;
        }).attr('class', function (d) {
            return 'node-title node-title-' + d.id;
        });
        nodeEnter.append('text').attr({
            x: icon.width,
            dy: icon.height * .9,
            'text-anchor': 'middle',
            class: function (d) {
                return 'node-label node-label-' + d.type + ' node-label-' + d.id;
            }
        }).text(function (d) {
            return subStrCN(d.name, 10, true);
        }).style({
            'font-size': fontSize,
            'font-weight': 'bold'
        });
        nodeEnter.append('text').attr('class', 'node-hint');
        svg.selectAll('g text.node-hint').each(insertLinebreaks);
        nodeUpdate = node.transition().duration(duration).attr('transform', function (d) {
            return 'translate(' + d.x0 + ',' + d.y + ')';
        }).style('opacity', 1);
        nodeUpdate.selectAll('text').style('fill-opacity', 1);
        nodeExit = node.exit().transition().duration(duration).attr('transform', function (d) {
            // return 'translate(' + source.x + ',' + source.y + ')';
            return 'translate(' + (d.x - icon.width * 2) + ',' + d.y + ')';
        }).style('opacity', 1e-6).remove();
        callback && callback(nodes);
    }

    function updateNodesXOffset() { // 更新节点横坐标
        var offsetX = [];
        offsetX[0] = 0;
        nodes.forEach(function (node) {
            node.x = 0;
            if (node.level > 0) {
                node.x = offsetX[node.level - 1] + gaps[node.level - 1] + icon.width * 1.7; // leeway
                offsetX[node.level] = node.x;
            }
            node.x0 = node.x;
        });
    }

    function getNodeY(id) { // 获取节点纵坐标
        var res = 0;
        tmpNodes.some(function (node) {
            if (node.id === id) {
                res = node.x;
                return;
            }
        });
        return res;
    }

    function prepareNodes(nodes, level) { // 数据集合准备
        var level = level || 1;
        nodes.forEach(function (node, index) {
            var subLevel = level;
            node.level = level;
            node.id = node.id || getSeed();
            if (node.type === 'now') {
                soul = node;
            }
            prepareNode(node);
            if (node.children) {
                subLevel += 1;
                prepareNodes(node.children, subLevel);
            }
        });
    }

    function prepareNode(node) { // 单位数据准备
        node.y = getNodeY(node.id);
        if (typeof gaps[node.level] === 'undefined') {
            gaps[node.level] = icon.width;
        }
        node.depth = parseInt(node.level);
        nodes.push(node);
    }

    function customSpline(d) { // 自定义连接线
        var p = [];
        var m = (d.source.x + d.target.x) / 2;
        p[0] = d.source.x + ',' + d.source.y;
        p[3] = d.target.x + ',' + d.target.y;
        p[1] = m + ',' + d.source.y;
        p[2] = m + ',' + d.target.y;
        return 'M' + p[0] + 'C' + p[1] + ' ' + p[2] + ' ' + p[3];
    }

    function redrawNode(id, type, text) { // 重绘节点
        type = icon['type'][type] || type;
        text = text || '';
        svg.select('.node-icon-' + id).attr('href', type);
        svg.select('.node-label-' + id).text(subStrCN(text, 10, true));
        svg.select('.node-title-' + id).text(text);
    }

    function addNode(val) { // 增加节点
        if (isLocking) {
            return;
        }
        if (!data) {
            initData(val);
            return;
        }
        if (maxCount && $svg.find('.node').length >= maxCount) {
            alert('最大节点总数不能超过：' + maxCount);
            return;
        }
        var newData = {
            id: getSeed(),
            name: soul.name,
            type: 'now'
        };
        var newNode;
        isLocking = true;
        if (soul.children) {
            soul.children.unshift(newData);
        } else {
            soul.children = [newData];
        }
        soul.name = val || '';
        soul.type = 'replica';
        soul.hint = getTime();
        reset();
        redrawNode(soul.id, loader, '正在创建...');
        setTimeout(function () {
            redrawNode(soul.id, 'replica', val || '');
            getStarted(data);
            isLocking = false;
        }, timer);
    }

    function reset() { // 重设
        gaps.length = 0;
        nodes.length = 0;
        aList.length = 0;
        unselectNode();
        // soul = null;
    }

    function setAList(node, data) { // 设置优先级
        var index;
        var hasSoul = false;
        var traverse = function (data) {
            $.each(data, function (index, node) {
                if (node.type === 'now') {
                    return hasSoul = true;
                }
                if (node.children) {
                    traverse(node.children);
                }
            });
        };
        node['a-list'] = 1;
        aList.push(node.id);
        if (node.parent) {
            index = node.parent.children.indexOf(node);
            if (index !== 0) { // 置首
                // traverse(node.parent.children);
                // if (hasSoul) {
                node.parent.children.splice(0, 0, node.parent.children.splice(index, 1)[0]);
                // }
            }
            setAList(node.parent, data);
        } else {
            adjustAList(data);
        }
    }

    function adjustAList(data) { // 调整优先级
        data.forEach(function (node) {
            if (aList.indexOf(node.id) < 0) {
                node['a-list'] = 2;
            }
            if (node.children) {
                adjustAList(node.children);
            }
        });
    }

    function getSeed() { // 得到随机id
        return '' + Math.floor((Math.random() * 10000) + 10000);
    }

    function restoreNode(val) { // 还原节点
        if (isLocking || !data || !curNode || (curNode && curNode.id === soul.id)) {
            return;
        }
        if (maxCount && $svg.find('.node').length >= maxCount) {
            alert('最大节点总数不能超过：' + maxCount);
            return;
        }
        var id = curNode.id;
        var tmpNode;
        var lastTraverse = function (data) {
            $.each(data, function (index, node) {
                if (node.id === id) {
                    node.children = node.children || [];
                    if (node.children.length === 1) {
                        tmpNode = $.extend([], node.children[0].children);
                        node.children[0] = {
                            id: getSeed(),
                            name: node.children[0].name,
                            type: 'replica',
                            hint: node.children[0].hint || getTime(),
                            children: tmpNode
                        };
                    }
                    node.children.unshift({
                        id: getSeed(),
                        name: '当前',
                        type: 'now'
                    });
                    aList.push(node.children[0].id);
                    setAList(node, data);
                    return false;
                }
                if (node.children) {
                    lastTraverse(node.children);
                }
            });
        };
        var firstTraverse = function (data) {
            $.each(data, function (index, node) {
                if (node.type === 'now') {
                    node.parent.children[index] = {
                        id: getSeed(),
                        name: val || '',
                        type: 'replica',
                        hint: getTime()
                    };
                    return false;
                }
                if (node.children) {
                    firstTraverse(node.children);
                }
            });
        };
        isLocking = true;
        reset();
        firstTraverse(data);
        lastTraverse(data);
        redrawNode(soul.id, loader, '正在还原...');
        setTimeout(function () {
            getStarted(data);
            isLocking = false;
        }, timer);
    }

    function removeNode(d, nodes) { // 移除节点
        var tmpNode;
        if (!arguments.length || isLocking || ['now', 'root'].indexOf(d.type) > -1) {
            return;
        }
        if (!nodes) {
            nodes = data;
            redrawNode(d.id, loader, '正在删除...');
        }
        $.each(nodes, function (index, node) {
            if (node.id === d.id) {
                if ($svg.find('.node').length === 3 || node.parent.type === 'root' && node.parent.children.length === 1 && node.children && node.children.length === 1 && !node.children[
                    0].hasOwnProperty('children')) { // Need to fix
                    isLocking = true;
                    setTimeout(function (self) {
                        $('.node, .link').fadeOut(function () {
                            $(self).remove();
                            reset();
                            data = null;
                            global.treeGraph.clear();
                        });
                        isLocking = false;
                    }, timer, this);
                    return false;
                }
                if (node.children) {
                    tmpNode = $.extend([], node.children);
                    node.parent.children.splice(index, 1);
                    tmpNode.forEach(function (child) {
                        node.parent.children.push(child);
                    });
                } else {
                    node.parent.children.splice(index, 1);
                }
                reset();
                isLocking = true;
                curNode = null;
                setTimeout(function () {
                    getStarted(data);
                    isLocking = false;
                }, timer);
                return false;
            }
            if (node.children) {
                removeNode(d, node.children);
            }
        });
    }

    function subStrCN(str, len, dot) { // 截取字符串
        var str = str || '';
        var newLength = 0;
        var newStr = '';
        var chineseRegex = /[^\x00-\xff]/g;
        var singleChar = '';
        var strLength = str.replace(chineseRegex, '**').length;
        var i = 0;
        for (; i < strLength; i += 1) {
            singleChar = str.charAt(i).toString();
            if (singleChar.match(chineseRegex) !== null) {
                newLength += 2;
            } else {
                newLength += 1;
            }
            if (newLength > len) {
                break;
            }
            newStr += singleChar;
        }
        if (dot && strLength > len) {
            newStr += '...';
        }
        return newStr;
    }

    function selectNode(d) { // 高亮
        $('.snapshot-action').find('button[rel="restore"], button[rel="remove"]').prop('disabled', (d.type !== 'replica')); // TBD
        d3.select('#highlight').transition().duration(100).ease('linear').attr('fill-opacity', 1e-6).transition().duration(200).ease('linear').attr({
            transform: function () {
                return 'translate(' + (d.x0 + icon.width / 2 - 5) + ',' + (d.y - icon.height / 2 - 5) + ')'; // leeway
            },
            'fill-opacity': 1
        });
        curNode = d;
    }

    function unselectNode() { // 取消高亮
        d3.select('#highlight').transition().duration(300).ease('linear').attr('fill-opacity', 1e-6);
        $('.snapshot-action').find('button[rel="restore"], button[rel="remove"]').prop('disabled', true); // TBD
    }

    function contextMenu(d) { // 节点右键菜单
        var x;
        var y;
        selectNode(d);
        if (d3.event.pageX || d3.event.pageY) {
            x = d3.event.pageX;
            y = d3.event.pageY;
        } else if (d3.event.clientX || d3.event.clientY) {
            x = d3.event.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
            y = d3.event.clientY + document.body.scrollTop + document.documentElement.scrollTop;
        }
        d3.select('#' + id + 'Menu').style({
            position: 'absolute',
            left: x + 'px',
            top: y + 'px',
            display: 'block'
        }).on('mouseleave', function () {
            d3.select(this).style('display', 'none');
        });
        $('#' + id + 'Menu li').hide();
        if (['now', 'root'].indexOf(d.type) > -1) {
            $('#' + id + 'Menu li:not([class])').show();
        } else {
            $('#' + id + 'Menu li[class]').show();
        }
        d3.event.preventDefault();
    }

    function lsTest() { // 验证存储
        var test = 'test';
        try {
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            return false;
        }
    }

    global.treeGraph = { // TBD
        getStarted: getStarted,
        remove: function () {
            removeNode(curNode);
        },
        getNode: function () {
            return curNode;
        },
        addNode: addNode,
        create: function () {
            $('#snapshotName').val('');
            $('.snapshot-form').show();
            $('.createSnapshot').show();
            $('.restoreSnapshot').hide();
        },
        restore: function () {
            $('#snapshotName').val('');
            $('.snapshot-form').show();
            $('.createSnapshot').hide();
            $('.restoreSnapshot').show();
        },
        restoreNode: restoreNode,
        zoom: function (val) {
            val = val || 1;
            setZoom(val);
        },
        clear: function () {
            lsTest() && localStorage.removeItem('ICSTreeGraphData');
            window.location.reload();
        },
        getData: function () {
            return datum;
        },
        init: function (val) {
            var originData = lsTest() && localStorage['ICSTreeGraphData'];
            if (originData) {
                try {
                    data = JSON.parse(originData);
                } catch (e) {
                    data = null;
                }
                if (data) {
                    rootName = data[0].name;
                    getStarted(data);
                } else {
                    lsTest() && this.clear();
                    rootName = val;
                }
            } else {
                rootName = val;
            }
            delete this.init;
        }
    };
    global.treeGraph.init('' + new Date().getTime());
})(window.ICS = window.ICS || {});
$(function () {
    $('.snapshot-action button').click(function (e) {
        var type = e.target.getAttribute('rel');
        ICS.treeGraph[type] && ICS.treeGraph[type]();
    });
    $('.createSnapshot').click(function () {
        ICS.treeGraph.addNode($('#snapshotName').val());
        $('.snapshot-form').hide();
    });
    $('.restoreSnapshot').click(function () {
        ICS.treeGraph.restoreNode($('#snapshotName').val());
        $('.snapshot-form').hide();
    });
});