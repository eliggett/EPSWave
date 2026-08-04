#!/usr/local/bin/perl
# This is an attempt to emulate the Amiga's 'autodoc' program, which
# extracts the function information given with the source of each
# function.
# The command-line arguments are the list of files to read for
# autodoc information.
%name2desc = ();

mainloop: for (;;)
{
	# Read until we see a line of the form
	# /****** PackageName/FunctionName ****************
	while (($_ = <>) !~ /^\/\*{6}\s+(\S+)/)
	{
		last mainloop if eof();
	}
	/^\/\*{6}\s+(\S+)/;
	$name = $1;		# Get the package/function name
	$desc = '';		# Clear the function description.

	# Read a bunch of lines that start with a single '*' in
	# the first column.
	while (($_ = <>) =~ /^\*([^\*])/)
	{
		$desc .= "$1$'";	# Append the rest of the line to the
				# description.
	}

	# Add the new function description to '%name2desc'.
	$name2desc{$name} = $desc;
}

# Now print out a table of contents, in alphabetical order.
print "TABLE OF CONTENTS\n\n";

# Print the names of the functions, separated by <CR>s.
$, = "\n";
print sort case_insensitive keys %name2desc;
print "\n\cl";		# Page break

# Now print the descriptions, separated by page breaks.
$, = '';
for (sort(keys %name2desc))
{
	print "$_", ' 'x(77-(2*length)), "$_\n";
	print "$name2desc{$_}\n\cl";
}

sub case_insensitive {
	($xa = $a) =~ y/A-Z/a-z/;
	($xb = $b) =~ y/A-Z/a-z/;
	return(-1) if ($xa lt $xb);
	return(1) if ($xa gt $xb);
	return(0);
}
