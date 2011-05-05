#!/usr/bin/python
# build_xpi.py -- builds JAR and XPI files for mozilla extensions
# by Chromakode <chromakode@gmail.com>
#
# Based on the functionality of build.sh by Nickolay Ponomarev, Nathan Yergler.

import sys
import re
import time
from os import system, path, curdir, pardir, sep, walk, remove, stat, access, R_OK
from shutil import rmtree
import subprocess
from xml.dom import minidom
from zipfile import ZipFile, ZipInfo, ZIP_STORED, ZIP_DEFLATED

try:
    import hashlib
    def sha_hash(data):
        return ("SHA256", hashlib.sha256(data).hexdigest())
except ImportError:
    # Python <2.5 compatibility
    import sha
    def sha_hash(data):
        return ("SHA1", sha.new(data).hexdigest())

# From Python 2.6: posixpath.py
# Should work on windows too, since we're not going to run into case inconsistencies or UNC paths 
def _relpath(p, start=curdir):
    """Return a relative version of a path"""
    
    if not p:
        raise ValueError("no path specified")

    start_list = path.abspath(start).split(sep)
    path_list = path.abspath(p).split(sep)

    # Work out how much of the filepath is shared by start and path.
    i = len(path.commonprefix([start_list, path_list]))

    rel_list = [pardir] * (len(start_list)-i) + path_list[i:]
    if not rel_list:
        return curdir
    return path.join(*rel_list)
    
# Python <2.6 compatibility
if hasattr(path, "relpath"):
    relpath = path.relpath
else:
    relpath = _relpath

def walk_visible(*args):
    for root, dirs, files in walk(*args):
        # Do not walk hidden ".foo" files
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        
        yield root, dirs, files

def remove_if_exists(p):
    if path.exists(p):
        remove(p)

class XPIBuilder:
    def __init__(self, basepath, config, quiet=False, verbose=False):
        self.basepath = basepath
        
        self.info = None
        self.success_msgs = []

        # Config variables
        self.c = config
        self.quiet = quiet
        self.verbose = verbose

        # Special paths/names
        self.n = {}
        self.n["src"] = self.c["src_path"]
        self.n["install.rdf"] = path.join(self.c["src_path"], "install.rdf")
        self.n["xpi"] = self.c["app_name"]+".xpi"
    
    def msg(self, msg, verbose=True):
        if not self.quiet and (not verbose or self.verbose):
            print(msg)
    
    def p(self, p):
        """Return a path relative to the the base path"""
        return path.join(self.basepath, p)
    
    def pn(self, n):
        """Return a path for the named file relative to the base path"""            
        return self.p(self.n[n])
    
    def add_file_to_zip(self, p, zip, base=None):
        # Don't ever add the zip file itself
        if path.abspath(p) != path.abspath(zip.filename):
            if base is not None:
                rp = relpath(p, base)
            else:
                rp = p
                
            self.msg("\t\tAdding %s" % rp)
                
            zip.write(p, rp)

    def add_dir_to_zip(self, dir, zip, base=None):
        for root, dirs, files in walk_visible(dir):
            for filename in files:
                # Skip "backup" filenames ending with '~'
                if not filename.endswith("~"):
                    p = path.join(root, filename)
                    self.add_file_to_zip(p, zip, base)
    
    def read_info(self):
        self.msg("Reading info from install.rdf file...")
        
        rdf_dom = minidom.parse(self.pn("install.rdf"))
        descs = rdf_dom.getElementsByTagName("RDF:Description")
        for desc in descs:
            if desc.getAttribute("RDF:about") == "urn:mozilla:install-manifest": break
        else:
            print("Warning: Unable to locate install-manifest in install.rdf file.")
            return
        
        self.info = {}
        self.info["id"] = desc.getAttribute("em:id")
        self.info["version"] = desc.getAttribute("em:version")
        self.info["type"] = int(desc.getAttribute("em:type"))
        
    def print_info(self):
        self.msg("Built [%s]." % self.info["id"], False)
        self.msg(" - Version: %s" % self.info["version"], False)
        self.msg(" - Filename: %s" % self.pn("xpi"), False)
        
        xpifile = open(self.pn("xpi"), "r")
        hashname, hash = sha_hash(xpifile.read())
        xpifile.close()
        self.msg(" - %s: %s" % (hashname, hash), False)
        
        for success_msg in self.success_msgs:
            self.msg(success_msg, False)
    
    def clean(self):
        """Remove any files from the previous build"""
        self.msg("Cleaning build directory...")
        remove_if_exists(self.pn("xpi"))
    
    def build(self):
        def runcalls(calls):
            for call in calls:
                if type(call) is str:
                    system(call)
                else:
                    call(self)
                    
        self.msg("Starting XPI build...")
        
        self.read_info()
        if "before" in self.c:
            self.msg("Calling pre-build hooks...")
            runcalls(self.c["before"])
        
        self.clean()
        self.build_xpi()
        
        if "after" in self.c:
            self.msg("Calling post-build hooks...")
            runcalls(self.c["after"])
            
        self.msg("Done.")
        self.print_info()
            
    def build_xpi(self):
        self.msg("Creating XPI file %s..." % relpath(self.pn("xpi")))
        xpifile = ZipFile(self.pn("xpi"), "w", ZIP_DEFLATED)
        
        self.msg("\tAdding source directory \"%s\":" % self.pn("src"))
        self.add_dir_to_zip(self.pn("src"), xpifile, self.pn("src"))
            
        self.msg("\tAdding extra files")
        for extrafile in self.c["extra_files"]:
            self.add_file_to_zip(self.p(extrafile), xpifile, self.basepath)
        
        xpifile.close()
        
def run_spock(spock_path, input_path, output_path, **args):
    spock_args = {"key_dir_path"    :"-d",
                  "extension_id"    :"-i",
                  "destination_url" :"-u",
                  "xpi_path"        :"-f",
                  "version"         :"-v"}
    
    def update_extension_id(id, type):
        if type == 2:
            pre = "urn:mozilla:extension:"
        elif type == 4:
            pre = "urn:mozilla:theme:"
        else:
            pre = "urn:mozilla:item:"
        
        return pre+id

    def run(builder):
        full_input_path = builder.p(input_path)
        full_output_path = builder.p(output_path)
        
        if not access(full_input_path, R_OK):
            errormsg = "unable to access input file \"%s\"." % input_path
            builder.msg("Skipping spock run: %s" % errormsg)
            builder.success_msgs.append(" ! Spock run failed: %s" % errormsg)
            return
        
        builder.msg("Running spock...")
        args["xpi_path"] = builder.pn("xpi")
        args["version"] = builder.info["version"]
        args["extension_id"] = update_extension_id(builder.info["id"], builder.info["type"])
        
        arglist = [spock_path]
        for arg, value in args.iteritems():
            if arg in spock_args:
                arglist.append(spock_args[arg])
                arglist.append(value)
        arglist.append(full_input_path)
        
        output_file = open(full_output_path, "w")
        subprocess.call(arglist, stdout=output_file)
        output_file.close()
        
        builder.success_msgs.append(" + Spock created %s successfully." % output_path)
    return run
                
def load_config():
    try:
        from buildxpi_config import config
    except ImportError:
        sys.exit("Error: Unable to import the build configuration data. Please make sure the module build_xpi_config exists and is properly formatted.")

    config.setdefault("src_path", "src")

    # Import local build configuration
    try:
        from buildxpi_config_local import config as config_local
        config.update(config_local)
    except ImportError:
        pass
    
    return config

def main():
    from optparse import OptionParser
    
    parser = OptionParser()
    parser.add_option("-q", "--quiet",
                      action="store_true", dest="quiet", default=False,
                      help="disable all status messages")
    parser.add_option("-v", "--verbose",
                      action="store_true", dest="verbose", default=False,
                      help="enable verbose status messages")
    parser.add_option("-p", "--path",
                      action="store", dest="path", default=sys.path[0],
                      help="build the XPI sources located at this path")

    (options, args) = parser.parse_args()
    
    # Add the source path to the module path so that we can import the options file.
    if options.path not in sys.path:
        sys.path.append(options.path)
    
    builder = XPIBuilder(options.path, load_config(), options.quiet, options.verbose)
    builder.build()

if __name__ == "__main__":
    main()
