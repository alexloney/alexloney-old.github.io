( function($) {
$(document).ready(function () {
  
	"use strict";
	
	/* === Pretty Photo === */
	$("a[rel^='prettyPhoto']").prettyPhoto();
	
	/* === Fit Videos === */
	$(".scale-video").fitVids();
	
	/* === Portfolio Filter Menu === */
	$('ul.filter li a').click(function(e) {
		e.preventDefault();
		
		$('ul.filter li.active').removeClass('active');
		$(this).parent().addClass('active');
		
		var filterVal = $(this).text().toLowerCase().replace(new RegExp(" ", "g"), "-");
		
		if(filterVal == 'all') {
			$('.work').removeClass('item-hidden');
			$('.work a').attr('rel', 'prettyPhoto[biopic_works_gal]');
		}
		else {
			$('.work').each(function(index, element) {
				if(!$(this).hasClass(filterVal)) {
					$(this).addClass('item-hidden');
					$('a', this).attr('rel', '');
				}
				else {
					$(this).removeClass('item-hidden');
					$('a', this).attr('rel', 'prettyPhoto[biopic_works_gal]');
				}
			});
		}
	});
	
	/* === Accordion === */
	var accordionTabs = $('.accordion > .atab');
	$('.accordion > .atitle > a').click(function(e) {
		e.preventDefault();
		
		var currenttab = $(this);
		var targetTab =  currenttab.parent().next();
		
		// if same tab clicked then close it
		if (currenttab.parent().hasClass('active')) {
			accordionTabs.slideUp(300, 'easeOutExpo');
			currenttab.parent().parent().find('.atitle').removeClass('active');
		}
		else if(!targetTab.hasClass('active'))	{
			accordionTabs.slideUp(300, 'easeOutExpo');
			targetTab.slideDown(300, 'easeOutExpo');
			currenttab.parent().parent().find('.atitle').removeClass('active');
			currenttab.parent().addClass('active');
		}
	});
	
	
	/* === Toggle === */
	$(".toggle > .ttitle > a").click(function(e) {
		e.preventDefault();
		
		if($(this).parent().hasClass('active'))	{
			$(this).parent().removeClass("active").closest('.toggle').find('.ttab').slideUp(300, 'easeOutExpo');
		}
		else {
			$(this).parent().addClass("active").closest('.toggle').find('.ttab').slideDown(300, 'easeOutExpo');
		}
	});
	
	/* === Closes alert boxes e.g. warning, success etc. === */
	$('.alert-box .close-btn').click(function(e) {
		e.preventDefault();
		$(this).parent().slideUp();
	});
	
	
	function loadTweets() {
		jQuery(document).ready(function($) {
			if($(".twitter-updates").length != 0) {
				$.ajaxSetup({cache: true});
				$.getJSON("twitter/get-twitter-feed.php", {"twitterid" : "themebakers", "numtweets" : 2}, function(data) {
					$(".twitter-updates").append("<ul></ul>");
					$.each(data, function(index, item) {
						$(".twitter-updates > ul").append('<li><span>' + item.text.linkify() + '</span><a href="http://twitter.com/themebakers/status/' + item.id_str + '>' + relative_time(item.created_at) + '</a></li>');
					});
				});
			}
		});
	}
	
	addLoadEvent(loadTweets);

});

} ) ( jQuery );
